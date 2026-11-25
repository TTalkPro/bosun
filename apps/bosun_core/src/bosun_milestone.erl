%%%-------------------------------------------------------------------
%%% @doc Milestone：一次发布的任务范围。设计见 designs/14-milestone.md。
%%%
%%% - id = `<KEY>-M<N>'（项目内序号，`project.milestone_seq'），永远不会和任务 id（`KEY-12'）撞；
%%%   序号跟着项目走，组织作用域导入时不会和别的组织冲突（全局计数器会）。
%%% - 状态 planning → active → released；active ↔ planning（pause）；released → active（reopen）。
%%%   每个项目同时最多一个 active（D1）。
%%% - 任务的归属在 `task.milestone'；校验（同项目、不能加进已发布的）在 `resolve_in_tx/2'，
%%%   bosun_task 的建单 / 修改都走它。Epic 也可以进（一次发布 = 若干 Epic + 若干独立任务），
%%%   Epic 换 milestone 时没做完的步骤跟着走（bosun_task 里做）。
%%% - 每次归属变化都记进 `task.milestone_log'（移入 / 移出 / 跟随 Epic），
%%%   milestone 详情据此列出「范围变更」。
%%%-------------------------------------------------------------------
-module(bosun_milestone).

-include("bosun.hrl").

-export([create/2, get/1, list/1, update/2, delete/1,
         activate/2, pause/2, reopen/2, release/2,
         active/1, brief_active/1, assign/4, assign/5]).
-export([parse_id/1, resolve_in_tx/2, resolve_filter/2, name_of/1, counts/1, to_map/1,
         log_entry/5, changes/1, released/1]).

-define(ID_RE, "^([A-Z][A-Z0-9]{1,9})-M([1-9][0-9]*)$").

%%====================================================================
%% 增删改查
%%====================================================================

%% @doc Input: #{<<"name">>, <<"description">>, <<"start_date">>, <<"target_date">>, <<"actor">>}
-spec create(term(), map()) -> {ok, map()} | {error, term()}.
create(Key0, Input) when is_map(Input) ->
    case bosun_id:validate_key(Key0) of
        {error, _} -> {error, {project, not_found}};
        {ok, Key} ->
            case validate_fields(Input, #{name => <<>>, start_date => undefined, target_date => undefined}) of
                {ok, #{name := <<>>}} -> {error, {invalid, name, <<"must not be empty">>}};
                {ok, #{name := Name, start_date := Start, target_date := Target}} ->
                    Actor = actor(Input),
                    Res = bosun_store:transaction(fun() ->
                        bosun_scope:project_visible(Key) orelse bosun_store:abort({project, not_found}),
                        P = case mnesia:read(project, Key, write) of
                                [#project{archived = true}] -> bosun_store:abort({project, archived});
                                [P0] -> P0
                            end,
                        unique_name_in_tx(Key, Name, undefined),
                        Seq = seq0(P#project.milestone_seq) + 1,
                        Now = bosun_util:now_ms(),
                        ok = mnesia:write(P#project{milestone_seq = Seq}),
                        M = #milestone{id = id(Key, Seq), project_key = Key, seq = Seq, name = Name,
                                       description = bosun_util:get_bin(<<"description">>, Input, <<>>),
                                       status = planning, start_date = Start, target_date = Target,
                                       created_by = Actor, created_at = Now, updated_at = Now},
                        mnesia:read(milestone, M#milestone.id, write) =:= [] orelse bosun_store:abort({conflict, id}),
                        ok = mnesia:write(M),
                        M
                    end),
                    map_result(Res);
                {error, _} = E -> E
            end
    end.

-spec get(term()) -> {ok, map()} | {error, not_found}.
get(Id0) ->
    case read_dirty(Id0) of
        [M] -> {ok, (to_map(M))#{<<"changes">> => changes(M#milestone.id)}};
        [] -> {error, not_found}
    end.

%% @doc 项目里的 milestone：进行中在前，规划中按目标日期（没写的排后）、再按序号，已发布按发布时间倒序。
-spec list(term()) -> {ok, [map()]} | {error, term()}.
list(Key0) ->
    case bosun_id:validate_key(Key0) of
        {error, _} -> {error, {project, not_found}};
        {ok, Key} ->
            case bosun_scope:project_visible(Key) of
                false -> {error, {project, not_found}};
                true ->
                    All = mnesia:dirty_index_read(milestone, Key, #milestone.project_key),
                    {ok, [to_map(M) || M <- lists:sort(fun(A, B) -> order_key(A) =< order_key(B) end, All)]}
            end
    end.

order_key(#milestone{status = active, seq = S}) -> {0, S};
order_key(#milestone{status = planning, target_date = undefined, seq = S}) -> {1, <<"~">>, S};
order_key(#milestone{status = planning, target_date = D, seq = S}) -> {1, D, S};
order_key(#milestone{status = released, released_at = At, seq = S}) -> {2, -seq0(At), S}.

%% @doc 改 name / description / start_date / target_date（"" 或 null 清空日期）；其它键忽略。
-spec update(term(), map()) -> {ok, map()} | {error, term()}.
update(Id0, Input) when is_map(Input) ->
    Res = bosun_store:transaction(fun() ->
        M0 = read_tx(Id0),
        Defaults = #{name => M0#milestone.name, start_date => M0#milestone.start_date,
                     target_date => M0#milestone.target_date},
        case validate_fields(Input, Defaults) of
            {ok, #{name := <<>>}} -> bosun_store:abort({invalid, name, <<"must not be empty">>});
            {ok, #{name := Name, start_date := Start, target_date := Target}} ->
                Name =:= M0#milestone.name orelse unique_name_in_tx(M0#milestone.project_key, Name, M0#milestone.id),
                M = M0#milestone{name = Name, start_date = Start, target_date = Target,
                                 description = case maps:find(<<"description">>, Input) of
                                                   {ok, D} when is_binary(D) -> bosun_util:trim(D);
                                                   _ -> M0#milestone.description
                                               end,
                                 updated_at = bosun_util:now_ms()},
                ok = mnesia:write(M),
                M;
            {error, R} -> bosun_store:abort(R)
        end
    end),
    map_result(Res).

%% @doc 只有规划中、且没有任务的能删。
-spec delete(term()) -> ok | {error, term()}.
delete(Id0) ->
    Res = bosun_store:transaction(fun() ->
        M = read_tx(Id0),
        M#milestone.status =:= planning orelse bosun_store:abort({milestone_state, M#milestone.status, delete}),
        mnesia:index_read(task, M#milestone.id, #task.milestone) =:= [] orelse bosun_store:abort(not_empty),
        mnesia:delete({milestone, M#milestone.id})
    end),
    case Res of
        {ok, ok} -> ok;
        {error, _} = E -> E
    end.

%%====================================================================
%% 状态
%%====================================================================

%% @doc planning → active。项目里已有别的 active：{conflict, active_exists, OtherId}。
-spec activate(term(), map()) -> {ok, map()} | {error, term()}.
activate(Id0, _Opts) -> to_active(Id0, planning, activate).

%% @doc released → active（同样受「一个进行中」约束）；发布快照留着，下次发布再覆盖。
-spec reopen(term(), map()) -> {ok, map()} | {error, term()}.
reopen(Id0, _Opts) -> to_active(Id0, released, reopen).

%% @doc active → planning。
-spec pause(term(), map()) -> {ok, map()} | {error, term()}.
pause(Id0, _Opts) ->
    Res = bosun_store:transaction(fun() ->
        M = read_tx(Id0),
        M#milestone.status =:= active orelse bosun_store:abort({milestone_state, M#milestone.status, pause}),
        M2 = M#milestone{status = planning, updated_at = bosun_util:now_ms()},
        ok = mnesia:write(M2),
        M2
    end),
    map_result(Res).

to_active(Id0, From, Action) ->
    Res = bosun_store:transaction(fun() ->
        M = read_tx(Id0),
        M#milestone.status =:= From orelse bosun_store:abort({milestone_state, M#milestone.status, Action}),
        case [O#milestone.id || O <- mnesia:index_read(milestone, M#milestone.project_key, #milestone.project_key),
                                O#milestone.status =:= active, O#milestone.id =/= M#milestone.id] of
            [] -> ok;
            [Other | _] -> bosun_store:abort({conflict, active_exists, Other})
        end,
        M2 = M#milestone{status = active, updated_at = bosun_util:now_ms()},
        ok = mnesia:write(M2),
        M2
    end),
    map_result(Res).

%% @doc 发布（只能从 active）= 这次发布的验收。Opts: #{notes => Markdown, actor}。
%%
%% - 范围里还有没做完的（NEW / IN_PROGRESS，Epic 也算）→ 拒绝 {unfinished, [Id]}：先完成或移出（用户定，2026-11-25）；
%% - 已完成（DONE）的一律置为已验收（VERIFIED），历史记「随 <名称> 发布验收」——发布本身就是验收，
%%   不走执行方自验收要测试的那条检查，否则自己做的任务会把整个发布卡住；
%% - 已拒绝 / 已撤销的留在里面，不挡发布，记进快照；
%% - 一个事务里写完状态与快照 summary，提交后重建这些任务（及其 Epic）的索引。
-spec release(term(), map()) -> {ok, map()} | {error, term()}.
release(Id0, Opts) when is_map(Opts) ->
    Actor = actor(Opts),
    Res = bosun_store:transaction(fun() ->
        M = read_tx(Id0),
        M#milestone.status =:= active orelse bosun_store:abort({milestone_state, M#milestone.status, release}),
        Tasks = sort_tasks(mnesia:index_read(task, M#milestone.id, #task.milestone)),
        case [T#task.id || #task{status = S} = T <- Tasks, S =:= new orelse S =:= in_progress] of
            [] -> ok;
            Open -> bosun_store:abort({unfinished, Open})
        end,
        Now = bosun_util:now_ms(),
        Why = <<"随 "/utf8, (M#milestone.name)/binary, " 发布验收"/utf8>>,
        Verified = [begin
                        Entry = #{from => done, to => verified, actor => Actor, comment => Why, at => Now,
                                  commits => [], tests => undefined},
                        ok = mnesia:write(T#task{status = verified, history = [Entry | T#task.history], updated_at = Now}),
                        T#task.id
                    end || #task{status = done} = T <- Tasks],
        Epics = bosun_task_status:sync_epics_in_tx([T#task.epic || T <- Tasks], Actor, Now, <<"release (auto)">>),
        Ids = fun(St) -> [T#task.id || T <- Tasks, T#task.kind =/= epic, lists:member(T#task.status, St)] end,
        Delivered = Ids([done, verified]),
        Summary = #{<<"released_by">> => Actor,
                    <<"counts">> => #{<<"delivered">> => length(Delivered),
                                      <<"verified_on_release">> => length([1 || T <- Tasks, T#task.kind =/= epic, T#task.status =:= done]),
                                      <<"rejected">> => length(Ids([rejected])),
                                      <<"cancelled">> => length(Ids([cancelled]))},
                    <<"delivered">> => Delivered,
                    <<"verified_on_release">> => Verified,
                    <<"epics">> => [T#task.id || T <- Tasks, T#task.kind =:= epic],
                    %% 快照里的空值一律用 null：summary 原样进出 JSON，导入回来也是 null，往返不变
                    <<"notes">> => case maps:get(<<"notes">>, Opts, undefined) of
                                       N when is_binary(N), N =/= <<>> -> N;
                                       _ -> null
                                   end},
        M2 = M#milestone{status = released, released_at = Now, summary = Summary, updated_at = Now},
        ok = mnesia:write(M2),
        {M2, Verified ++ Epics}
    end),
    case Res of
        {ok, {M2, Touched}} ->
            bosun_task_status:reindex_epics(Touched),
            {ok, to_map(M2)};
        {error, _} = E -> E
    end.

%% @doc 项目当前进行中的 milestone。
-spec active(binary()) -> {ok, binary()} | none.
active(Key) ->
    case [M#milestone.id || M <- mnesia:dirty_index_read(milestone, Key, #milestone.project_key),
                            M#milestone.status =:= active] of
        [Id | _] -> {ok, Id};
        [] -> none
    end.

%% @doc 项目 JSON 里带的当前 milestone 摘要（侧栏 / 项目卡片用）；没有 → undefined。
-spec brief_active(binary()) -> map() | undefined.
brief_active(Key) ->
    case [M || M <- mnesia:dirty_index_read(milestone, Key, #milestone.project_key), M#milestone.status =:= active] of
        [M | _] ->
            #{<<"id">> => M#milestone.id, <<"name">> => M#milestone.name, <<"target_date">> => M#milestone.target_date,
              <<"percent">> => maps:get(<<"percent">>, counts(M#milestone.id))};
        [] -> undefined
    end.

%% @doc 批量设置任务归属（"" = 移出）。逐条走 bosun_task:update，各自成败：
%% #{<<"updated">> => [Id], <<"failed">> => [#{id, reason}]}。任务必须属于 Key 这个项目。
-spec assign(term(), [term()], term(), binary()) -> {ok, map()} | {error, term()}.
assign(Key0, Ids, Value, Actor) -> assign(Key0, Ids, Value, Actor, undefined).

%% @doc 同上，Comment 记进每个任务的变更记录（milestone_comment）。
-spec assign(term(), [term()], term(), binary(), binary() | undefined) -> {ok, map()} | {error, term()}.
assign(Key0, Ids, Value, Actor, Comment) when is_list(Ids) ->
    case bosun_id:validate_key(Key0) of
        {error, _} -> {error, {project, not_found}};
        {ok, Key} ->
            case bosun_scope:project_visible(Key) of
                false -> {error, {project, not_found}};
                true ->
                    {Ok, Failed} = lists:foldl(fun(Id0, {Ok, Fail}) ->
                        Id = bosun_id:normalize_key(bosun_util:to_binary(Id0)),
                        case bosun_id:parse_task_id(Id) of
                            {ok, Id, Key, _} ->
                                Input = #{<<"milestone">> => Value, <<"actor">> => Actor},
                                case bosun_task:update(Id, case Comment of
                                                               C when is_binary(C), C =/= <<>> -> Input#{<<"milestone_comment">> => C};
                                                               _ -> Input
                                                           end) of
                                    {ok, _} -> {[Id | Ok], Fail};
                                    {error, R} -> {Ok, [#{<<"id">> => Id, <<"reason">> => reason_text(R)} | Fail]}
                                end;
                            _ -> {Ok, [#{<<"id">> => Id, <<"reason">> => <<"not a task of ", Key/binary>>} | Fail]}
                        end
                    end, {[], []}, Ids),
                    {ok, #{<<"updated">> => lists:reverse(Ok), <<"failed">> => lists:reverse(Failed)}}
            end
    end;
assign(_, _, _, _, _) -> {error, {invalid, ids, <<"expected a list of task ids">>}}.

reason_text(not_found) -> <<"not found">>;
reason_text({invalid, _F, Why}) -> bosun_util:to_binary(Why);
reason_text(R) -> bosun_util:to_binary(io_lib:format("~p", [R])).

%%====================================================================
%% 给 bosun_task / bosun_bql / bosun_json 用
%%====================================================================

-spec parse_id(term()) -> {ok, binary(), binary(), pos_integer()} | error.
parse_id(V) when is_binary(V) ->
    Id = bosun_id:normalize_key(V),
    case re:run(Id, ?ID_RE, [{capture, all_but_first, binary}]) of
        {match, [Key, Seq]} -> {ok, Id, Key, binary_to_integer(Seq)};
        nomatch -> error
    end;
parse_id(_) -> error.

%% @doc 事务内：项目 Key 的任务要设的 milestone 值 → 存进记录的 id。
%% 值可以是 id（BOS-M3）、名称（0.1.4）或 `active'；""、null = 移出（undefined）。
-spec resolve_in_tx(binary(), term()) -> binary() | undefined.
resolve_in_tx(_Key, V) when V =:= undefined; V =:= null -> undefined;
resolve_in_tx(Key, V) when is_binary(V) ->
    case bosun_util:trim(V) of
        <<>> -> undefined;
        Raw ->
            case resolve_ref_in_tx(Key, Raw) of
                #milestone{status = released, name = N} ->
                    bosun_store:abort({invalid, milestone, <<N/binary, " is released; pick a planning or active milestone">>});
                #milestone{id = Id} -> Id;
                none when Raw =:= <<"active">> ->
                    bosun_store:abort({invalid, milestone, <<"project ", Key/binary, " has no active milestone">>});
                none -> bosun_store:abort({invalid, milestone, <<"no milestone ", Raw/binary, " in ", Key/binary>>})
            end
    end;
resolve_in_tx(_Key, _) -> bosun_store:abort({invalid, milestone, <<"expected a milestone id or name">>}).

%% id / 名称 / active → 同项目的记录（别的项目的 id 一律当不存在）
resolve_ref_in_tx(Key, Raw) ->
    Same = [M || M <- mnesia:index_read(milestone, Key, #milestone.project_key)],
    ById = case parse_id(Raw) of
               {ok, Id, Key, _} -> [M || M <- Same, M#milestone.id =:= Id];
               _ -> []
           end,
    case ById of
        [M | _] -> M;
        [] ->
            case [M || M <- Same, M#milestone.name =:= Raw] of
                [M | _] -> M;
                [] when Raw =:= <<"active">> ->
                    case [M || M <- Same, M#milestone.status =:= active] of
                        [M | _] -> M;
                        [] -> none
                    end;
                [] -> none
            end
    end.

%% @doc 列表过滤：<<"backlog">> → backlog；id / 名称 / active → {id, Id}；active 但没有 → nothing。
-spec resolve_filter(binary(), term()) -> {ok, undefined | backlog | nothing | {id, binary()}} | {error, term()}.
resolve_filter(_Key, V) when V =:= undefined; V =:= null; V =:= <<>> -> {ok, undefined};
resolve_filter(Key, V) when is_binary(V) ->
    case bosun_util:trim(V) of
        <<"backlog">> -> {ok, backlog};
        Raw ->
            case mnesia:transaction(fun() -> resolve_ref_in_tx(Key, Raw) end) of
                {atomic, #milestone{id = Id}} -> {ok, {id, Id}};
                {atomic, none} when Raw =:= <<"active">> -> {ok, nothing};
                {atomic, none} -> {error, {invalid, milestone, <<"no milestone ", Raw/binary, " in ", Key/binary>>}};
                {aborted, R} -> {error, R}
            end
    end;
resolve_filter(_, _) -> {error, {invalid, milestone, <<"expected a milestone id, name, active or backlog">>}}.

-spec name_of(binary() | undefined) -> binary() | undefined.
name_of(undefined) -> undefined;
name_of(Id) ->
    case mnesia:dirty_read(milestone, Id) of
        [#milestone{name = N}] -> N;
        [] -> undefined
    end.

%% @doc 进度口径（14 §3）：范围不含 REJECTED / CANCELLED；完成 = DONE + VERIFIED。
-spec counts(binary()) -> map().
counts(Id) ->
    All = bosun_task:visible(mnesia:dirty_index_read(task, Id, #task.milestone)),
    %% Epic 的完成由步骤决定，计进范围会重复计数：单独数
    {Epics, Tasks} = lists:partition(fun(#task{kind = K}) -> K =:= epic end, All),
    N = fun(Ss) -> length([1 || #task{status = S} <- Tasks, lists:member(S, Ss)]) end,
    Scope = N([new, in_progress, done, verified]),
    Done = N([done, verified]),
    #{<<"total">> => length(Tasks),
      <<"epics">> => length(Epics),
      <<"epics_done">> => length([1 || #task{status = S} <- Epics, S =:= done orelse S =:= verified]),
      <<"scope">> => Scope,
      <<"open">> => N([new, in_progress]),
      <<"in_progress">> => N([in_progress]),
      <<"done">> => Done,
      <<"verified">> => N([verified]),
      <<"pending_verify">> => N([done]),
      <<"rejected">> => N([rejected]),
      <<"cancelled">> => N([cancelled]),
      <<"percent">> => case Scope of 0 -> 0; _ -> Done * 100 div Scope end}.

-spec to_map(#milestone{}) -> map().
to_map(#milestone{} = M) ->
    #{<<"id">> => M#milestone.id,
      <<"project_key">> => M#milestone.project_key,
      <<"seq">> => M#milestone.seq,
      <<"name">> => M#milestone.name,
      <<"description">> => M#milestone.description,
      <<"status">> => atom_to_binary(M#milestone.status, utf8),
      <<"start_date">> => M#milestone.start_date,
      <<"target_date">> => M#milestone.target_date,
      <<"released_at">> => bosun_json:iso8601(M#milestone.released_at),
      <<"summary">> => M#milestone.summary,
      <<"created_by">> => M#milestone.created_by,
      <<"created_at">> => bosun_json:iso8601(M#milestone.created_at),
      <<"updated_at">> => bosun_json:iso8601(M#milestone.updated_at),
      <<"counts">> => counts(M#milestone.id)}.

%% @doc 一条归属变更记录（task.milestone_log 的元素）。
-spec log_entry(binary() | undefined, binary() | undefined, binary(), integer(), binary() | undefined) -> map().
log_entry(From, To, Actor, At, Comment) ->
    #{from => From, to => To, actor => Actor, at => At, comment => Comment}.

%% @doc 是否已发布（给 bosun_task 判断 Epic 级联时用；事务内外都行）。
-spec released(binary() | undefined) -> boolean().
released(undefined) -> false;
released(Id) ->
    case mnesia:dirty_read(milestone, Id) of
        [#milestone{status = released}] -> true;
        _ -> false
    end.

%% @doc 范围变更：本项目任务的变更记录里 from 或 to 是这个 milestone 的条目，按时间。
%% direction = in（移入）/ out（移出）；建单时直接落进来的也算 in（from = null）。
-spec changes(binary()) -> [map()].
changes(Id) ->
    {ok, _, Key, _} = parse_id(Id),
    Tasks = bosun_task:visible(mnesia:dirty_index_read(task, Key, #task.project_key)),
    Entries = [{At, T, E} || T <- Tasks, #{at := At} = E <- log0(T#task.milestone_log),
                             maps:get(from, E) =:= Id orelse maps:get(to, E) =:= Id],
    [#{<<"task">> => T#task.id, <<"title">> => T#task.title, <<"kind">> => atom_to_binary(bosun_task:kind_of(T), utf8),
       <<"status">> => bosun_task_status:to_binary(T#task.status),
       <<"direction">> => case maps:get(to, E) of Id -> <<"in">>; _ -> <<"out">> end,
       <<"from">> => maps:get(from, E), <<"to">> => maps:get(to, E),
       <<"from_name">> => name_of(maps:get(from, E)), <<"to_name">> => name_of(maps:get(to, E)),
       <<"actor">> => maps:get(actor, E), <<"comment">> => maps:get(comment, E, undefined),
       <<"at">> => bosun_json:iso8601(At)}
     || {At, T, E} <- lists:sort(fun({A, _, _}, {B, _, _}) -> A =< B end, Entries)].

%%====================================================================
%% 内部
%%====================================================================

log0(undefined) -> [];
log0(L) -> L.

id(Key, Seq) -> <<Key/binary, "-M", (integer_to_binary(Seq))/binary>>.

seq0(undefined) -> 0;
seq0(N) -> N.

actor(Input) ->
    case bosun_util:get_bin(<<"actor">>, Input, <<>>) of
        <<>> -> case bosun_scope:actor_name() of undefined -> <<"user">>; N -> N end;
        A -> A
    end.

%% 不在当前作用域（别的组织 / key 白名单外的项目）的按不存在处理
read_dirty(Id0) ->
    case parse_id(bosun_util:to_binary(Id0)) of
        {ok, Id, _, _} -> visible(mnesia:dirty_read(milestone, Id));
        error -> []
    end.

read_tx(Id0) ->
    case parse_id(bosun_util:to_binary(Id0)) of
        {ok, Id, _, _} ->
            case visible(mnesia:read(milestone, Id, write)) of
                [M] -> M;
                [] -> bosun_store:abort(not_found)
            end;
        error -> bosun_store:abort(not_found)
    end.

visible([#milestone{project_key = K} = M]) ->
    case bosun_scope:project_visible(K) of
        true -> [M];
        false -> []
    end;
visible([]) -> [].

unique_name_in_tx(Key, Name, Self) ->
    case [M || M <- mnesia:index_read(milestone, Key, #milestone.project_key),
               M#milestone.name =:= Name, M#milestone.id =/= Self] of
        [] -> ok;
        [_ | _] -> bosun_store:abort({conflict, name})
    end.

sort_tasks(Ts) -> lists:sort(fun(A, B) -> A#task.seq =< B#task.seq end, Ts).

map_result({ok, #milestone{} = M}) -> {ok, to_map(M)};
map_result({error, _} = E) -> E.

%% name / start_date / target_date：缺的取 Defaults；日期 "" / null = 清空；开始不能晚于目标
validate_fields(Input, Defaults) ->
    try
        Name = case maps:find(<<"name">>, Input) of
                   {ok, V} when is_binary(V) -> bosun_util:trim(V);
                   {ok, _} -> throw({invalid, name, <<"must be a string">>});
                   error -> maps:get(name, Defaults)
               end,
        Start = date_field(<<"start_date">>, Input, maps:get(start_date, Defaults)),
        Target = date_field(<<"target_date">>, Input, maps:get(target_date, Defaults)),
        case {Start, Target} of
            {S, T} when is_binary(S), is_binary(T), S > T ->
                throw({invalid, target_date, <<"must not be earlier than start_date">>});
            _ -> ok
        end,
        {ok, #{name => Name, start_date => Start, target_date => Target}}
    catch
        throw:{invalid, _, _} = R -> {error, R}
    end.

date_field(K, Input, Default) ->
    case maps:find(K, Input) of
        error -> Default;
        {ok, V} when V =:= null; V =:= undefined; V =:= <<>> -> undefined;
        {ok, V} when is_binary(V) ->
            D = bosun_util:trim(V),
            case re:run(D, "^(\\d{4})-(\\d{2})-(\\d{2})$", [{capture, all_but_first, binary}]) of
                {match, [Y, M, Dd]} ->
                    case calendar:valid_date(binary_to_integer(Y), binary_to_integer(M), binary_to_integer(Dd)) of
                        true -> D;
                        false -> throw({invalid, K, <<"no such day">>})
                    end;
                nomatch -> throw({invalid, K, <<"expected YYYY-MM-DD">>})
            end;
        {ok, _} -> throw({invalid, K, <<"expected YYYY-MM-DD">>})
    end.
