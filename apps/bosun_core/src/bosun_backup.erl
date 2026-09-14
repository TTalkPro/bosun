%%%-------------------------------------------------------------------
%%% @doc 全库导出 / 导入（JSON）。
%%%
%%% 导出的是**内部形态**（时间用毫秒整数、序号计数器一并带上），保证往返无损；
%%% 不是给人读的 API JSON。搜索索引不导出——导入后从 Mnesia 重建。
%%%
%%% 导入模式：replace（清空后写入）| merge（同 key 覆盖，计数器取大者）。
%%%
%%% 作用域（13）：有组织主体时只导出本组织的项目 / 任务 / 反馈 / 关联 / 筛选器 / 操作者，
%%% 导入把项目 / 筛选器 / 操作者打上本组织（筛选器换新 id 免得撞别的组织），别的组织已占的
%%% 项目 key 报 {conflict, key}；replace 只清本组织的数据；计数器只在系统作用域下导入。
%%% 用户 / 会话 / API key 不进导出。
%%%-------------------------------------------------------------------
-module(bosun_backup).

-include("bosun.hrl").

-export([export/0, export_file/1, import/2, import_file/2]).

-define(FORMAT, <<"bosun-export">>).
-define(VERSION, 2).

%%====================================================================
%% 导出
%%====================================================================

-spec export() -> {ok, map()}.
export() ->
    Org = bosun_scope:org_id(),
    Projects = [P || #project{org_id = O} = P <- mnesia:dirty_select(project, [{'_', [], ['$_']}]),
                     Org =:= undefined orelse O =:= Org],
    Keys = maps:from_list([{P#project.key, true} || P <- Projects]),
    Tasks = [T || T <- mnesia:dirty_select(task, [{'_', [], ['$_']}]),
                  Org =:= undefined orelse maps:is_key(T#task.project_key, Keys)],
    Ids = maps:from_list([{T#task.id, true} || T <- Tasks]),
    Fbs = [F || F <- mnesia:dirty_select(feedback, [{'_', [], ['$_']}]),
                Org =:= undefined orelse maps:is_key(F#feedback.task_id, Ids)],
    Filters = [F || #filter{org_id = O} = F <- mnesia:dirty_select(filter, [{'_', [], ['$_']}]),
                    Org =:= undefined orelse O =:= Org],
    Counters = case Org of
                   undefined -> mnesia:dirty_select(counter, [{'_', [], ['$_']}]);
                   _ -> []
               end,
    Actors = [A || #actor{org_id = O} = A <- mnesia:dirty_select(actor, [{'_', [], ['$_']}]),
                   Org =:= undefined orelse O =:= Org],
    Links = [L || L <- bosun_link:all(),
                  Org =:= undefined orelse (maps:is_key(L#link.from, Ids) andalso maps:is_key(L#link.to, Ids))],
    {ok, #{<<"format">> => ?FORMAT,
           <<"version">> => ?VERSION,
           <<"exported_at">> => bosun_json:iso8601(bosun_util:now_ms()),
           <<"projects">> => [project_out(P) || P <- sort_by(#project.key, Projects)],
           <<"tasks">> => [task_out(T) || T <- sort_by(#task.id, Tasks)],
           <<"feedback">> => [feedback_out(F) || F <- sort_by(#feedback.id, Fbs)],
           <<"filters">> => [filter_out(F) || F <- sort_by(#filter.id, Filters)],
           <<"actors">> => [actor_out(A) || A <- sort_by(#actor.name, Actors)],
           <<"links">> => [link_out(L) || L <- sort_by(#link.key, Links)],
           <<"counters">> => maps:from_list([{atom_to_binary(K, utf8), V} || #counter{key = K, value = V} <- Counters])}}.

-spec export_file(file:name_all()) -> ok | {error, term()}.
export_file(Path) ->
    {ok, Map} = export(),
    file:write_file(Path, bosun_json:encode(Map)).

sort_by(Pos, Recs) -> lists:sort(fun(A, B) -> element(Pos, A) =< element(Pos, B) end, Recs).

project_out(#project{} = P) ->
    #{<<"key">> => P#project.key, <<"name">> => P#project.name, <<"description">> => P#project.description,
      <<"task_seq">> => P#project.task_seq, <<"archived">> => P#project.archived,
      <<"created_at">> => P#project.created_at, <<"updated_at">> => P#project.updated_at}.

task_out(#task{} = T) ->
    #{<<"id">> => T#task.id, <<"project_key">> => T#task.project_key, <<"seq">> => T#task.seq,
      <<"title">> => T#task.title, <<"description">> => T#task.description,
      <<"status">> => bosun_task_status:to_binary(T#task.status),
      <<"priority">> => atom_to_binary(T#task.priority, utf8),
      <<"labels">> => T#task.labels,
      <<"history">> => [history_out(H) || H <- T#task.history],
      <<"feedback_seq">> => T#task.feedback_seq,
      <<"assignee">> => T#task.assignee,
      <<"kind">> => atom_to_binary(bosun_task:kind_of(T), utf8),
      <<"epic">> => T#task.epic,
      <<"created_at">> => T#task.created_at, <<"updated_at">> => T#task.updated_at}.

history_out(#{to := To, actor := Actor, at := At} = H) ->
    #{<<"from">> => case maps:get(from, H, undefined) of undefined -> undefined; F -> bosun_task_status:to_binary(F) end,
      <<"to">> => bosun_task_status:to_binary(To), <<"actor">> => Actor,
      <<"comment">> => maps:get(comment, H, undefined), <<"at">> => At,
      <<"commits">> => maps:get(commits, H, []),
      <<"tests">> => case maps:get(tests, H, undefined) of
                         undefined -> undefined;
                         #{command := C, passed := P, summary := S} -> #{<<"command">> => C, <<"passed">> => P, <<"summary">> => S}
                     end}.

feedback_out(#feedback{} = F) ->
    #{<<"id">> => F#feedback.id, <<"task_id">> => F#feedback.task_id, <<"seq">> => F#feedback.seq,
      <<"author">> => F#feedback.author, <<"kind">> => atom_to_binary(F#feedback.kind, utf8),
      <<"content">> => F#feedback.content, <<"created_at">> => F#feedback.created_at,
      <<"supersedes">> => F#feedback.supersedes, <<"superseded_by">> => F#feedback.superseded_by}.

link_out(#link{from = From, to = To, type = Type, actor = Actor, created_at = At}) ->
    #{<<"from">> => From, <<"to">> => To, <<"type">> => bosun_link:type_to_binary(Type),
      <<"actor">> => Actor, <<"created_at">> => At}.

actor_out(#actor{} = A) ->
    #{<<"name">> => A#actor.name, <<"kind">> => atom_to_binary(A#actor.kind, utf8),
      <<"project">> => A#actor.project, <<"worktree">> => A#actor.worktree,
      <<"first_seen">> => A#actor.first_seen, <<"last_seen">> => A#actor.last_seen}.

filter_out(#filter{} = F) ->
    #{<<"id">> => F#filter.id, <<"name">> => F#filter.name, <<"query">> => F#filter.query,
      <<"created_at">> => F#filter.created_at, <<"updated_at">> => F#filter.updated_at}.

%%====================================================================
%% 导入
%%====================================================================

%% @doc Opts: #{mode => replace | merge}（缺省 merge）
-spec import(map(), map()) -> {ok, map()} | {error, term()}.
import(#{<<"format">> := ?FORMAT, <<"version">> := V} = Data, Opts) when V =:= 1; V =:= 2 ->
    Mode = maps:get(mode, Opts, merge),
    Org = bosun_scope:org_id(),
    try
        Projects = [(project_in(P))#project{org_id = Org} || P <- maps:get(<<"projects">>, Data, [])],
        Tasks = [task_in(T) || T <- maps:get(<<"tasks">>, Data, [])],
        Fbs = [feedback_in(F) || F <- maps:get(<<"feedback">>, Data, [])],
        Filters0 = [(filter_in(F))#filter{org_id = Org} || F <- maps:get(<<"filters">>, Data, [])],
        Actors = [(actor_in(A))#actor{org_id = Org} || A <- maps:get(<<"actors">>, Data, [])],
        Links = [link_in(L) || L <- maps:get(<<"links">>, Data, [])],
        Counters = case Org of
                       undefined -> [{binary_to_atom(K, utf8), N} || {K, N} <- maps:to_list(maps:get(<<"counters">>, Data, #{})), is_integer(N)];
                       _ -> []
                   end,
        Res = bosun_store:transaction(fun() ->
            case {Mode, Org} of
                {replace, undefined} ->
                    lists:foreach(fun(Tab) -> [mnesia:delete({Tab, K}) || K <- mnesia:all_keys(Tab)] end,
                                  [project, task, feedback, filter, counter, actor, link]);
                {replace, _} -> delete_org_data(Org);
                {merge, _} -> ok
            end,
            %% 别的组织已占的 key 不能覆盖
            lists:foreach(fun(#project{key = K}) ->
                case mnesia:read(project, K, write) of
                    [#project{org_id = O}] when Org =/= undefined, O =/= Org -> bosun_store:abort({conflict, key});
                    _ -> ok
                end
            end, Projects),
            %% 组织作用域下筛选器换新 id（旧 id 可能是别的组织的）
            Filters = case Org of
                          undefined -> Filters0;
                          _ -> [F#filter{id = <<"f", (integer_to_binary(bosun_store:next_id(filter)))/binary>>} || F <- Filters0]
                      end,
            lists:foreach(fun(R) -> ok = mnesia:write(R) end, Projects ++ Tasks ++ Fbs ++ Filters ++ Actors ++ Links),
            lists:foreach(fun({K, N}) ->
                Cur = case mnesia:read(counter, K) of [#counter{value = C}] -> C; [] -> 0 end,
                ok = mnesia:write(#counter{key = K, value = max(Cur, N)})
            end, Counters),
            ok
        end),
        case Res of
            {ok, ok} ->
                _ = bosun_search:reindex(),
                {ok, #{<<"mode">> => atom_to_binary(Mode, utf8),
                       <<"projects">> => length(Projects), <<"tasks">> => length(Tasks),
                       <<"feedback">> => length(Fbs), <<"filters">> => length(Filters0)}};
            {error, _} = E -> E
        end
    catch
        throw:{bad_record, Why} -> {error, {invalid, data, Why}};
        error:{badkey, Key} -> {error, {invalid, data, <<"missing field ", (bosun_util:to_binary(Key))/binary>>}};
        error:Reason -> {error, {invalid, data, bosun_util:to_binary(Reason)}}
    end;
import(#{<<"format">> := F}, _) when F =/= ?FORMAT ->
    {error, {invalid, data, <<"not a bosun export file">>}};
import(#{<<"version">> := V}, _) ->
    {error, {invalid, data, <<"unsupported export version ", (bosun_util:to_binary(V))/binary>>}};
import(_, _) ->
    {error, {invalid, data, <<"not a bosun export file">>}}.

%% 事务内：清掉一个组织的项目 / 任务 / 反馈 / 关联 / 筛选器 / 操作者
delete_org_data(Org) ->
    Keys = [P#project.key || P <- mnesia:index_read(project, Org, #project.org_id)],
    lists:foreach(fun(Key) ->
        lists:foreach(fun(#task{id = Id}) ->
            lists:foreach(fun(F) -> mnesia:delete_object(F) end, mnesia:index_read(feedback, Id, #feedback.task_id)),
            lists:foreach(fun(L) -> mnesia:delete_object(L) end,
                          mnesia:index_read(link, Id, #link.from) ++ mnesia:index_read(link, Id, #link.to)),
            mnesia:delete({task, Id})
        end, mnesia:index_read(task, Key, #task.project_key)),
        mnesia:delete({project, Key})
    end, Keys),
    lists:foreach(fun(F) -> mnesia:delete_object(F) end, mnesia:index_read(filter, Org, #filter.org_id)),
    lists:foreach(fun(A) -> mnesia:delete_object(A) end, mnesia:index_read(actor, Org, #actor.org_id)),
    ok.

-spec import_file(file:name_all(), map()) -> {ok, map()} | {error, term()}.
import_file(Path, Opts) ->
    case file:read_file(Path) of
        {ok, Bin} ->
            case bosun_json:decode(Bin) of
                {ok, Map} when is_map(Map) -> import(Map, Opts);
                _ -> {error, {invalid, data, <<"malformed JSON">>}}
            end;
        {error, R} -> {error, {file, R}}
    end.

project_in(#{<<"key">> := Key, <<"name">> := Name} = P) ->
    #project{key = Key, name = Name, description = maps:get(<<"description">>, P, <<>>),
             task_seq = maps:get(<<"task_seq">>, P, 0), archived = maps:get(<<"archived">>, P, false),
             created_at = maps:get(<<"created_at">>, P, 0), updated_at = maps:get(<<"updated_at">>, P, 0)}.

task_in(#{<<"id">> := Id, <<"project_key">> := PK, <<"seq">> := Seq, <<"title">> := Title} = T) ->
    #task{id = Id, project_key = PK, seq = Seq, title = Title,
          description = maps:get(<<"description">>, T, <<>>),
          status = status_in(maps:get(<<"status">>, T, <<"NEW">>)),
          priority = priority_in(maps:get(<<"priority">>, T, <<"medium">>)),
          labels = maps:get(<<"labels">>, T, []),
          history = [history_in(H) || H <- maps:get(<<"history">>, T, [])],
          feedback_seq = maps:get(<<"feedback_seq">>, T, 0),
          assignee = null_to_undef(maps:get(<<"assignee">>, T, undefined)),
          kind = case maps:get(<<"kind">>, T, <<"task">>) of <<"epic">> -> epic; _ -> task end,
          epic = null_to_undef(maps:get(<<"epic">>, T, undefined)),
          created_at = maps:get(<<"created_at">>, T, 0), updated_at = maps:get(<<"updated_at">>, T, 0)}.

history_in(#{<<"to">> := To} = H) ->
    #{from => case maps:get(<<"from">>, H, null) of null -> undefined; undefined -> undefined; F -> status_in(F) end,
      to => status_in(To), actor => maps:get(<<"actor">>, H, <<"user">>),
      comment => null_to_undef(maps:get(<<"comment">>, H, undefined)), at => maps:get(<<"at">>, H, 0),
      commits => case maps:get(<<"commits">>, H, []) of null -> []; L -> L end,
      tests => case maps:get(<<"tests">>, H, undefined) of
                   #{<<"passed">> := P} = M -> #{command => maps:get(<<"command">>, M, <<>>), passed => P, summary => maps:get(<<"summary">>, M, <<>>)};
                   _ -> undefined
               end}.

feedback_in(#{<<"id">> := Id, <<"task_id">> := TaskId, <<"seq">> := Seq, <<"content">> := Content} = F) ->
    Kind = case bosun_feedback:parse_kind(maps:get(<<"kind">>, F, <<"comment">>)) of
               {ok, K} -> K;
               {error, _} -> throw({bad_record, <<"bad feedback kind in ", Id/binary>>})
           end,
    #feedback{id = Id, task_id = TaskId, seq = Seq, author = maps:get(<<"author">>, F, <<"user">>),
              kind = Kind, content = Content, created_at = maps:get(<<"created_at">>, F, 0),
              supersedes = null_to_undef(maps:get(<<"supersedes">>, F, undefined)),
              superseded_by = null_to_undef(maps:get(<<"superseded_by">>, F, undefined))}.

actor_in(#{<<"name">> := Name} = A) ->
    Kind = case bosun_actor:parse_kind(maps:get(<<"kind">>, A, <<"agent">>)) of
               undefined -> throw({bad_record, <<"bad actor kind for ", Name/binary>>});
               K -> K
           end,
    #actor{name = Name, kind = Kind,
           project = null_to_undef(maps:get(<<"project">>, A, undefined)),
           worktree = null_to_undef(maps:get(<<"worktree">>, A, undefined)),
           first_seen = maps:get(<<"first_seen">>, A, 0), last_seen = maps:get(<<"last_seen">>, A, 0)}.

link_in(#{<<"from">> := From, <<"to">> := To, <<"type">> := T} = L) ->
    Type = case bosun_link:parse_type(T) of
               {ok, Ty} -> Ty;
               {error, _} -> throw({bad_record, <<"bad link type ", From/binary, " -> ", To/binary>>})
           end,
    #link{key = {From, To, Type}, from = From, to = To, type = Type,
          actor = maps:get(<<"actor">>, L, <<"user">>), created_at = maps:get(<<"created_at">>, L, 0)}.

filter_in(#{<<"id">> := Id, <<"name">> := Name, <<"query">> := Q} = F) ->
    #filter{id = Id, name = Name, query = Q,
            created_at = maps:get(<<"created_at">>, F, 0), updated_at = maps:get(<<"updated_at">>, F, 0)}.

status_in(S) ->
    case bosun_task_status:parse(S) of
        {ok, A} -> A;
        {error, _} -> throw({bad_record, <<"bad status ", (bosun_util:to_binary(S))/binary>>})
    end.

priority_in(P) ->
    case string:lowercase(bosun_util:to_binary(P)) of
        <<"low">> -> low; <<"medium">> -> medium; <<"high">> -> high;
        _ -> throw({bad_record, <<"bad priority ", (bosun_util:to_binary(P))/binary>>})
    end.

null_to_undef(null) -> undefined;
null_to_undef(V) -> V.
