%%%-------------------------------------------------------------------
%%% @doc 任务：创建（`KEY-N' 分配）/ 查询 / 列表 / 更新 / 全文检索。设计见 designs/02-task.md。
%%%-------------------------------------------------------------------
-module(bosun_task).

-include("bosun.hrl").

-export([create/2, get/1, list/2, update/2, find_by_ids/1, search/2]).
-export([kind_of/1, children/1, progress/1, parse_kind/1]).
-export([indexed/1, read_in_tx/2, read_dirty/1, visible/1]).

-define(DEFAULT_LIMIT, 100).
-define(MAX_LIMIT, 500).

%% @doc 创建任务。
%% Input: #{<<"title">>, <<"description">>, <<"priority">>, <<"labels">>, <<"actor">>,
%%          <<"assignee">>, <<"kind">> (task | epic), <<"epic">> (所属 Epic id)}
-spec create(term(), map()) -> {ok, map()} | {error, term()}.
create(Key0, Input) when is_map(Input) ->
    case bosun_id:validate_key(Key0) of
        {error, _} -> {error, {project, not_found}};
        {ok, Key} ->
            case validate_new(Input) of
                {ok, Title, Desc, Priority, Labels, Actor, Kind} ->
                    ok = bosun_actor:touch(Actor, bosun_actor:parse_kind(maps:get(<<"actor_kind">>, Input, undefined))),
                    Res = bosun_store:transaction(fun() ->
                        bosun_scope:project_visible(Key) orelse bosun_store:abort(not_found),
                        Epic = epic_in_tx(Kind, maps:get(<<"epic">>, Input, undefined)),
                        Seq = bosun_project:next_task_seq_in_tx(Key),
                        Now = bosun_util:now_ms(),
                        Id = bosun_id:task_id(Key, Seq),
                        T = #task{id = Id, project_key = Key, seq = Seq,
                                  title = Title, description = Desc,
                                  status = new, priority = Priority, labels = Labels,
                                  history = [#{from => undefined, to => new, actor => Actor,
                                               comment => undefined, at => Now}],
                                  feedback_seq = 0,
                                  created_at = Now, updated_at = Now,
                                  assignee = case bosun_util:get_opt_bin(<<"assignee">>, Input) of
                                                 <<>> -> undefined;
                                                 A -> A
                                             end,
                                  kind = Kind, epic = Epic},
                        %% 导入的旧数据可能让 task_seq 落后于已有任务：撞号就报错，绝不覆盖
                        mnesia:read(task, Id, write) =:= [] orelse bosun_store:abort({conflict, id}),
                        ok = mnesia:write(T),
                        %% 给已完成的 Epic 加了新步骤：Epic 回到进行中
                        Touched = bosun_task_status:sync_epics_in_tx([Epic], Actor, Now, <<"step added (auto)">>),
                        {bosun_json:task_full(T, []), Touched}
                    end),
                    case Res of
                        {error, not_found} -> {error, {project, not_found}};
                        {error, archived} -> {error, {project, archived}};
                        {ok, {Json, Touched}} ->
                            bosun_task_status:reindex_epics(Touched),
                            indexed({ok, Json});
                        {error, _} = E -> E
                    end;
                {error, _} = E -> E
            end
    end.

%% @doc 详情（含 history 与内嵌 feedback）。
-spec get(term()) -> {ok, map()} | {error, not_found | {invalid, id, binary()}}.
get(TaskId0) ->
    case bosun_id:parse_task_id(TaskId0) of
        {ok, TaskId, _, _} ->
            case read_dirty(TaskId) of
                [T] -> {ok, bosun_json:task_full(T, bosun_feedback:read_dirty(TaskId))};
                [] -> {error, not_found}
            end;
        {error, _} = E -> E
    end.

%% @doc 项目内任务摘要列表。
%% Filter（binary 键）: status（列表或逗号串）、label、q、kind（task | epic）、epic（Epic id）、limit、offset
%% 返回 #{<<"tasks">> => [摘要], <<"total">> => 过滤后总数}
-spec list(term(), map()) -> {ok, map()} | {error, term()}.
list(Key0, Filter) when is_map(Filter) ->
    case bosun_id:validate_key(Key0) of
        {error, _} -> {error, {project, not_found}};
        {ok, Key} ->
            case bosun_scope:project_visible(Key) of
                false -> {error, {project, not_found}};
                true ->
                    case parse_filter(Filter) of
                        {ok, F} ->
                            All = mnesia:dirty_index_read(task, Key, #task.project_key),
                            Sorted = lists:sort(fun(A, B) -> A#task.seq >= B#task.seq end, All),
                            Candidates = with_query(Key, Sorted, maps:get(q, F)),
                            Matched = sort_by(maps:get(sort, F), [T || T <- Candidates, matches(T, F)]),
                            Total = length(Matched),
                            Page = page(Matched, maps:get(offset, F), maps:get(limit, F)),
                            Summaries = [bosun_json:task_summary(T, bosun_feedback:read_dirty(T#task.id))
                                         || T <- Page],
                            {ok, #{<<"tasks">> => Summaries, <<"total">> => Total}};
                        {error, _} = E -> E
                    end
            end
    end.

%% @doc 修改 title / description / priority / labels / assignee / epic。status 被忽略（走 transition），
%% kind 建单后不可改。
-spec update(term(), map()) -> {ok, map()} | {error, term()}.
update(TaskId0, Input) when is_map(Input) ->
    case bosun_id:parse_task_id(TaskId0) of
        {ok, TaskId, _, _} ->
            Actor = case bosun_util:get_bin(<<"actor">>, Input, <<>>) of
                        <<>> -> case bosun_scope:actor_name() of undefined -> <<"user">>; N -> N end;
                        A -> A
                    end,
            Res = bosun_store:transaction(fun() ->
                case read_in_tx(TaskId, write) of
                    [] -> bosun_store:abort(not_found);
                    [T0] ->
                        T1 = apply_updates(T0, Input),
                        Now = bosun_util:now_ms(),
                        T2 = T1#task{updated_at = Now},
                        ok = mnesia:write(T2),
                        %% 换了 / 摘了 Epic：两边的 Epic 都要重新推导状态（旧的可能就此完成，新的可能被重开）
                        Touched = case T0#task.epic =:= T2#task.epic of
                                      true -> [];
                                      false -> bosun_task_status:sync_epics_in_tx(
                                                 [T0#task.epic, T2#task.epic], Actor, Now, <<"steps changed (auto)">>)
                                  end,
                        {bosun_json:task_full(T2, bosun_feedback:read_in_tx(TaskId)), Touched}
                end
            end),
            case Res of
                {ok, {Json, Touched}} ->
                    bosun_task_status:reindex_epics(Touched),
                    indexed({ok, Json});
                {error, _} = E -> E
            end;
        {error, _} = E -> E
    end.

%% @doc 跨项目全文检索，按任务聚合。
%% Opts（binary 键）: project、limit
%% 返回 #{<<"hits">> => [#{<<"task">> => 摘要, <<"score">>, <<"matched">> => task | feedback,
%%                        <<"feedback">> => 命中的 feedback 摘要 | undefined}]}
-spec search(term(), map()) -> {ok, map()} | {error, term()}.
search(Query, Opts) when is_map(Opts) ->
    Limit = clamp(to_int(maps:get(<<"limit">>, Opts, 20), 20), 1, 100),
    Project = case bosun_util:get_opt_bin(<<"project">>, Opts) of
                  undefined -> undefined;
                  <<>> -> undefined;
                  P -> P
              end,
    case bosun_search:search(bosun_util:to_binary(Query), #{project => Project, limit => Limit * 3}) of
        {ok, Hits} ->
            Grouped = group_hits(Hits, [], #{}),
            {ok, #{<<"hits">> => lists:sublist(Grouped, Limit)}};
        {error, _} = E -> E
    end.

%% 同一任务只保留分数最高（也就是最先出现）的那次命中
group_hits([], Acc, _Seen) -> lists:reverse(Acc);
group_hits([#{task_id := TaskId} = H | Rest], Acc, Seen) ->
    case maps:is_key(TaskId, Seen) of
        true -> group_hits(Rest, Acc, Seen);
        false ->
            case read_dirty(TaskId) of
                [] -> group_hits(Rest, Acc, Seen);
                [T] ->
                    Fbs = bosun_feedback:read_dirty(TaskId),
                    Hit0 = #{<<"task">> => bosun_json:task_summary(T, Fbs),
                             <<"score">> => maps:get(score, H),
                             <<"matched">> => atom_to_binary(maps:get(type, H), utf8)},
                    Hit = case H of
                              #{type := feedback, id := FbId} ->
                                  case [F || F <- Fbs, F#feedback.id =:= FbId] of
                                      [F] -> Hit0#{<<"feedback">> => snippet(bosun_json:feedback_to_map(F))};
                                      [] -> Hit0#{<<"feedback">> => undefined}
                                  end;
                              _ -> Hit0#{<<"feedback">> => undefined}
                          end,
                    group_hits(Rest, [Hit | Acc], Seen#{TaskId => true})
            end
    end.

snippet(#{<<"content">> := C} = F) ->
    Short = case string:length(C) > 160 of
                true -> <<(string:slice(C, 0, 160))/binary, "…"/utf8>>;
                false -> C
            end,
    (maps:with([<<"id">>, <<"author">>, <<"kind">>, <<"created_at">>], F))#{<<"snippet">> => Short}.

%% @doc 事务内读任务；不在当前作用域（别的组织）里的按不存在处理，返回 []。
-spec read_in_tx(binary(), read | write) -> [#task{}].
read_in_tx(TaskId, Lock) -> visible(mnesia:read(task, TaskId, Lock)).

-spec read_dirty(binary()) -> [#task{}].
read_dirty(TaskId) -> visible(mnesia:dirty_read(task, TaskId)).

%% @doc 过滤到当前作用域可见的任务（项目属于当前组织）。
-spec visible([#task{}]) -> [#task{}].
visible(Tasks) ->
    case bosun_scope:get() of
        undefined -> Tasks;
        _ ->
            %% 每个项目只查一次可见性（BQL 一次过全表，逐条查项目表太费）
            {Kept, _} = lists:foldl(fun(#task{project_key = Key} = T, {Acc, Seen}) ->
                {Ok, Seen1} = case Seen of
                                  #{Key := V} -> {V, Seen};
                                  _ -> V = bosun_scope:project_visible(Key), {V, Seen#{Key => V}}
                              end,
                {case Ok of true -> [T | Acc]; false -> Acc end, Seen1}
            end, {[], #{}}, Tasks),
            lists:reverse(Kept)
    end.

%% @doc 写操作成功后把任务送进索引（异步）。
-spec indexed({ok, map()} | {error, term()}) -> {ok, map()} | {error, term()}.
indexed({ok, Task} = Res) -> bosun_search:index_task(Task), Res;
indexed(Other) -> Other.

%% @doc 记录的类型；旧数据没有 kind 字段时视为 task。
-spec kind_of(#task{}) -> task | epic.
kind_of(#task{kind = epic}) -> epic;
kind_of(#task{}) -> task.

-spec parse_kind(term()) -> {ok, task | epic} | {error, term()}.
parse_kind(undefined) -> {ok, task};
parse_kind(null) -> {ok, task};
parse_kind(<<>>) -> {ok, task};
parse_kind(K) when is_atom(K) -> parse_kind(atom_to_binary(K, utf8));
parse_kind(Bin) when is_binary(Bin) ->
    case string:lowercase(bosun_util:trim(Bin)) of
        <<"task">> -> {ok, task};
        <<"epic">> -> {ok, epic};
        _ -> {error, {invalid, kind, <<"expected task or epic">>}}
    end;
parse_kind(_) -> {error, {invalid, kind, <<"expected task or epic">>}}.

%% @doc Epic 的子任务记录，按 id 序（项目 key、seq）。
-spec children(binary()) -> [#task{}].
children(EpicId) ->
    Kids = visible(mnesia:dirty_index_read(task, EpicId, #task.epic)),
    lists:sort(fun(A, B) -> {A#task.project_key, A#task.seq} =< {B#task.project_key, B#task.seq} end, Kids).

%% @doc Epic 进度：子任务按状态计数；done = 已完成数（DONE 或 VERIFIED）。
-spec progress(binary()) -> map().
progress(EpicId) ->
    Kids = children(EpicId),
    Total = length(Kids),
    Done = length([1 || #task{status = S} <- Kids, S =:= done orelse S =:= verified]),
    Cancelled = length([1 || #task{status = S} <- Kids, S =:= cancelled]),
    ActiveTotal = Total - Cancelled,
    Percent = case ActiveTotal of
                  0 when Total > 0 -> 100;
                  0 -> 0;
                  _ -> Done * 100 div ActiveTotal
              end,
    ByStatus = lists:foldl(fun(#task{status = S}, Acc) ->
                               maps:update_with(bosun_task_status:to_binary(S), fun(N) -> N + 1 end, 1, Acc)
                           end, #{}, Kids),
    #{<<"total">> => Total,
      <<"done">> => Done,
      <<"cancelled">> => Cancelled,
      <<"active_total">> => ActiveTotal,
      <<"percent">> => Percent,
      <<"by_status">> => ByStatus}.

%% @doc 批量读摘要；非法或不存在的 ID 静默跳过。
-spec find_by_ids([term()]) -> {ok, [map()]}.
find_by_ids(Ids) ->
    Found = lists:filtermap(fun(Id0) ->
        case bosun_id:parse_task_id(Id0) of
            {ok, Id, _, _} ->
                case read_dirty(Id) of
                    [T] -> {true, bosun_json:task_summary(T, bosun_feedback:read_dirty(Id))};
                    [] -> false
                end;
            _ -> false
        end
    end, Ids),
    {ok, Found}.

%%====================================================================
%% 内部
%%====================================================================

validate_new(Input) ->
    case bosun_util:get_bin(<<"title">>, Input, <<>>) of
        <<>> -> {error, {invalid, title, <<"must not be empty">>}};
        Title ->
            case parse_priority(maps:get(<<"priority">>, Input, undefined)) of
                {ok, Priority} ->
                    Actor = case bosun_util:get_bin(<<"actor">>, Input, <<>>) of
                                <<>> -> <<"user">>;
                                A -> A
                            end,
                    case parse_kind(maps:get(<<"kind">>, Input, undefined)) of
                        {ok, Kind} ->
                            {ok, Title,
                             bosun_util:get_bin(<<"description">>, Input, <<>>),
                             Priority,
                             bosun_util:labels(maps:get(<<"labels">>, Input, [])),
                             Actor, Kind};
                        {error, _} = E -> E
                    end;
                {error, _} = E -> E
            end
    end.

%% 事务内校验所属 Epic：存在且 kind = epic；Epic 自己不能挂 Epic。"" / null 表示不挂。
epic_in_tx(_Kind, undefined) -> undefined;
epic_in_tx(_Kind, null) -> undefined;
epic_in_tx(Kind, V) when is_binary(V) ->
    case bosun_util:trim(V) of
        <<>> -> undefined;
        _ when Kind =:= epic -> bosun_store:abort({invalid, epic, <<"an epic cannot belong to an epic">>});
        Raw ->
            case bosun_id:parse_task_id(Raw) of
                {ok, EpicId, _, _} ->
                    case read_in_tx(EpicId, read) of
                        [#task{kind = epic}] -> EpicId;
                        [_] -> bosun_store:abort({invalid, epic, <<EpicId/binary, " is not an epic">>});
                        [] -> bosun_store:abort({invalid, epic, <<EpicId/binary, " not found">>})
                    end;
                {error, _} -> bosun_store:abort({invalid, epic, <<"expected a task id like BOS-12">>})
            end
    end;
epic_in_tx(_Kind, _) -> bosun_store:abort({invalid, epic, <<"expected a task id like BOS-12">>}).

parse_priority(undefined) -> {ok, medium};
parse_priority(null) -> {ok, medium};
parse_priority(<<>>) -> {ok, medium};
parse_priority(P) when is_atom(P) -> parse_priority(atom_to_binary(P, utf8));
parse_priority(Bin) when is_binary(Bin) ->
    case string:lowercase(bosun_util:trim(Bin)) of
        <<"low">> -> {ok, low};
        <<"medium">> -> {ok, medium};
        <<"high">> -> {ok, high};
        _ -> {error, {invalid, priority, <<"expected one of low, medium, high">>}}
    end;
parse_priority(_) -> {error, {invalid, priority, <<"expected one of low, medium, high">>}}.

apply_updates(T, Input) ->
    maps:fold(fun
        (<<"title">>, V, Acc) ->
            case bosun_util:trim(V) of
                <<>> -> bosun_store:abort({invalid, title, <<"must not be empty">>});
                Title -> Acc#task{title = Title}
            end;
        (<<"description">>, V, Acc) -> Acc#task{description = bosun_util:trim(V)};
        (<<"priority">>, V, Acc) ->
            case parse_priority(V) of
                {ok, P} -> Acc#task{priority = P};
                {error, R} -> bosun_store:abort(R)
            end;
        (<<"labels">>, V, Acc) -> Acc#task{labels = bosun_util:labels(V)};
        (<<"assignee">>, V, Acc) ->
            case bosun_util:trim(V) of
                <<>> -> Acc#task{assignee = undefined};
                A -> Acc#task{assignee = A}
            end;
        (<<"epic">>, V, Acc) ->
            case epic_in_tx(kind_of(Acc), V) of
                Same when Same =:= Acc#task.id -> bosun_store:abort({invalid, epic, <<"a task cannot belong to itself">>});
                Epic -> Acc#task{epic = Epic}
            end;
        (_, _, Acc) -> Acc
    end, T, Input).

parse_filter(Filter) ->
    Limit = clamp(to_int(maps:get(<<"limit">>, Filter, ?DEFAULT_LIMIT), ?DEFAULT_LIMIT), 1, ?MAX_LIMIT),
    Offset = max(0, to_int(maps:get(<<"offset">>, Filter, 0), 0)),
    Label = case bosun_util:get_opt_bin(<<"label">>, Filter) of
                <<>> -> undefined;
                L -> L
            end,
    Q = case bosun_util:get_opt_bin(<<"q">>, Filter) of
            undefined -> undefined;
            <<>> -> undefined;
            Q0 -> string:lowercase(Q0)
        end,
    Epic = case bosun_util:get_opt_bin(<<"epic">>, Filter) of
               undefined -> undefined;
               <<>> -> undefined;
               E0 -> string:uppercase(bosun_util:trim(E0))
           end,
    Attention = bosun_util:to_bool(maps:get(<<"attention">>, Filter, false), false),
    Checks = [parse_statuses(maps:get(<<"status">>, Filter, undefined)),
              parse_kind_filter(maps:get(<<"kind">>, Filter, undefined)),
              parse_priorities(maps:get(<<"priority">>, Filter, undefined)),
              parse_assignees(maps:get(<<"assignee">>, Filter, undefined)),
              parse_sort(maps:get(<<"sort">>, Filter, undefined))],
    case [E || {error, _} = E <- Checks] of
        [E | _] -> E;
        [] ->
            [{ok, Statuses}, {ok, Kind}, {ok, Priorities}, {ok, Assignees}, {ok, Sort}] = Checks,
            {ok, #{status => Statuses, label => Label, q => Q, kind => Kind, epic => Epic,
                   priority => Priorities, assignee => Assignees, attention => Attention, sort => Sort,
                   limit => Limit, offset => Offset}}
    end.

%% 逗号分隔的串或列表 → 去空白后的非空项
csv(undefined) -> [];
csv(null) -> [];
csv(Bin) when is_binary(Bin) -> csv(binary:split(Bin, <<",">>, [global]));
csv(List) when is_list(List) -> [V || X <- List, is_binary(X), V <- [bosun_util:trim(X)], V =/= <<>>];
csv(_) -> error.

parse_priorities(V) ->
    case csv(V) of
        error -> {error, {invalid, priority, <<"expected a list of priorities">>}};
        [] -> {ok, undefined};
        Items ->
            Parsed = [facet_priority(I) || I <- Items],
            case lists:member(invalid, Parsed) of
                false -> {ok, Parsed};
                true -> {error, {invalid, priority, <<"must be low, medium or high">>}}
            end
    end.

%% 筛选用：直接回原子，不认识的回 invalid（不同于建单时 parse_priority/1 的 {ok, _} / 缺省 medium）
facet_priority(<<"low">>) -> low;
facet_priority(<<"medium">>) -> medium;
facet_priority(<<"high">>) -> high;
facet_priority(_) -> invalid.

%% 执行人：名字列表；`~none' 表示「未领取」（与前端看板的写法一致）
parse_assignees(V) ->
    case csv(V) of
        error -> {error, {invalid, assignee, <<"expected a list of names">>}};
        [] -> {ok, undefined};
        Items -> {ok, [case I of <<"~none">> -> undefined; _ -> I end || I <- Items]}
    end.

%% sort=field[:asc|desc]；缺省方向：id / updated / created / priority / feedback 降序，其余升序。
%% 不给 sort 时保持原来的顺序（最新在前；有 q 时按相关度）。
-define(SORT_FIELDS, [<<"id">>, <<"title">>, <<"status">>, <<"priority">>, <<"assignee">>,
                      <<"feedback">>, <<"updated">>, <<"created">>]).
parse_sort(undefined) -> {ok, undefined};
parse_sort(null) -> {ok, undefined};
parse_sort(<<>>) -> {ok, undefined};
parse_sort(Bin) when is_binary(Bin) ->
    {Field, Dir0} = case binary:split(string:lowercase(bosun_util:trim(Bin)), <<":">>) of
                        [F] -> {F, default};
                        [F, D] -> {F, D}
                    end,
    case lists:member(Field, ?SORT_FIELDS) of
        false -> {error, {invalid, sort, <<"unknown sort field ", Field/binary>>}};
        true ->
            case Dir0 of
                default -> {ok, {binary_to_atom(Field), default_dir(Field)}};
                <<"asc">> -> {ok, {binary_to_atom(Field), asc}};
                <<"desc">> -> {ok, {binary_to_atom(Field), desc}};
                _ -> {error, {invalid, sort, <<"direction must be asc or desc">>}}
            end
    end;
parse_sort(_) -> {error, {invalid, sort, <<"expected field[:asc|desc]">>}}.

default_dir(F) when F =:= <<"title">>; F =:= <<"status">>; F =:= <<"assignee">> -> asc;
default_dir(_) -> desc.

sort_by(undefined, Tasks) -> Tasks;
sort_by({Field, Dir}, Tasks) ->
    %% 先算好键（反馈数要读库，别在比较函数里反复读）；相同的按编号新在前，结果稳定
    Keyed = [{sort_key(Field, T), T} || T <- Tasks],
    Cmp = fun({Ka, A}, {Kb, B}) ->
                  case Ka =:= Kb of
                      true -> A#task.seq >= B#task.seq;
                      false when Dir =:= asc -> Ka < Kb;
                      false -> Ka > Kb
                  end
          end,
    [T || {_, T} <- lists:sort(Cmp, Keyed)].

sort_key(id, T) -> T#task.seq;
sort_key(title, T) -> string:lowercase(T#task.title);
sort_key(status, T) -> index_of(T#task.status, bosun_task_status:all());
sort_key(priority, T) -> case T#task.priority of low -> 1; medium -> 2; high -> 3 end;
%% 未领取的排在有人的后面（升序时）
sort_key(assignee, #task{assignee = undefined}) -> {1, <<>>};
sort_key(assignee, T) -> {0, string:lowercase(T#task.assignee)};
sort_key(feedback, T) -> bosun_feedback:count(T#task.id);
sort_key(updated, T) -> T#task.updated_at;
sort_key(created, T) -> T#task.created_at.

index_of(X, L) -> index_of(X, L, 1).
index_of(_, [], N) -> N;
index_of(X, [X | _], N) -> N;
index_of(X, [_ | T], N) -> index_of(X, T, N + 1).

%% 列表过滤的 kind：缺省不过滤（与建单时缺省 task 不同）
parse_kind_filter(undefined) -> {ok, undefined};
parse_kind_filter(null) -> {ok, undefined};
parse_kind_filter(<<>>) -> {ok, undefined};
parse_kind_filter(V) -> parse_kind(V).

parse_statuses(undefined) -> {ok, undefined};
parse_statuses(null) -> {ok, undefined};
parse_statuses(<<>>) -> {ok, undefined};
parse_statuses(Bin) when is_binary(Bin) ->
    parse_statuses(binary:split(Bin, <<",">>, [global]));
parse_statuses([]) -> {ok, undefined};
parse_statuses(List) when is_list(List) ->
    Parsed = [bosun_task_status:parse(S) || S <- List, bosun_util:trim(S) =/= <<>>],
    case [E || {error, E} <- Parsed] of
        [] ->
            case [S || {ok, S} <- Parsed] of
                [] -> {ok, undefined};
                Ss -> {ok, Ss}
            end;
        [E | _] -> {error, E}
    end;
parse_statuses(_) -> {error, {invalid, status, <<"expected a list of statuses">>}}.

matches(T, #{status := Statuses, label := Label, kind := Kind, epic := Epic} = F) ->
    Priorities = maps:get(priority, F, undefined),
    Assignees = maps:get(assignee, F, undefined),
    (Statuses =:= undefined orelse lists:member(T#task.status, Statuses))
    andalso (Label =:= undefined orelse lists:member(Label, T#task.labels))
    andalso (Kind =:= undefined orelse kind_of(T) =:= Kind)
    andalso (Epic =:= undefined orelse T#task.epic =:= Epic)
    andalso (Priorities =:= undefined orelse lists:member(T#task.priority, Priorities))
    andalso (Assignees =:= undefined orelse lists:member(T#task.assignee, Assignees))
    %% 需要关注 = 被阻塞或最新一条有效反馈是提问；放最后，前面的条件先把范围缩小再读链 / 反馈
    andalso (not maps:get(attention, F, false)
             orelse bosun_link:blocked(T#task.id)
             orelse bosun_json:open_question(bosun_feedback:read_dirty(T#task.id))).

%% 关键字：BM25（标题 / 正文 / 标签 / feedback）命中按分数排前面，再补上
%% 标题 / ID 子串命中（比如输入 "bos-1" 这种 ID 片段）；索引不可用时只走子串。
with_query(_Key, Sorted, undefined) ->
    Sorted;
with_query(Key, Sorted, Q) ->
    ById = maps:from_list([{T#task.id, T} || T <- Sorted]),
    Ranked = case bosun_search:search(Q, #{project => Key, limit => 500}) of
                 {ok, Hits} -> uniq([maps:get(task_id, H) || H <- Hits]);
                 {error, _} -> []
             end,
    FromIndex = [maps:get(Id, ById) || Id <- Ranked, maps:is_key(Id, ById)],
    RankedSet = maps:from_keys(Ranked, true),
    Substr = [T || T <- Sorted,
                   not maps:is_key(T#task.id, RankedSet),
                   binary:match(string:lowercase(T#task.title), Q) =/= nomatch orelse
                   binary:match(string:lowercase(T#task.id), Q) =/= nomatch],
    FromIndex ++ Substr.

uniq(L) -> uniq(L, #{}, []).
uniq([], _, Acc) -> lists:reverse(Acc);
uniq([H | T], Seen, Acc) ->
    case maps:is_key(H, Seen) of
        true -> uniq(T, Seen, Acc);
        false -> uniq(T, Seen#{H => true}, [H | Acc])
    end.

page(List, Offset, Limit) ->
    case Offset >= length(List) of
        true -> [];
        false -> lists:sublist(List, Offset + 1, Limit)
    end.

to_int(I, _) when is_integer(I) -> I;
to_int(B, Default) when is_binary(B) ->
    try binary_to_integer(B) catch error:badarg -> Default end;
to_int(_, Default) -> Default.

clamp(V, Lo, Hi) -> max(Lo, min(Hi, V)).
