%%%-------------------------------------------------------------------
%%% @doc 全库导出 / 导入（JSON）。
%%%
%%% 导出的是**内部形态**（时间用毫秒整数、序号计数器一并带上），保证往返无损；
%%% 不是给人读的 API JSON。搜索索引不导出——导入后从 Mnesia 重建。
%%%
%%% 导入模式：replace（清空后写入）| merge（同 key 覆盖，计数器取大者）。
%%%
%%% 作用域（13）：有组织主体时只导出本组织的项目 / 任务 / 反馈 / 关联 / 筛选器 / 操作者，
%%% 导入把项目 / 筛选器 / 操作者打上本组织（筛选器的 id 规则见 place_filters/5），别的组织已占的
%%% 项目 key 报 {conflict, key}；replace 只清本组织的数据；计数器只在系统作用域下导入。
%%% 用户 / 会话 / API key / 组织本身不进导出。项目 / 筛选器 / 操作者的 `org_id' 会写进文件，
%%% 但只有**系统作用域**（shell、`export_file' / `import_file'）导入时才采信——不然整库备份
%%% 还原后所有项目都成了孤儿；组织作用域下一律打成当前组织。
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
    Projects = [P || #project{org_id = O, key = K} = P <- mnesia:dirty_select(project, [{'_', [], ['$_']}]),
                     Org =:= undefined orelse (O =:= Org andalso bosun_scope:project_allowed(K))],
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
      <<"org_id">> => P#project.org_id,
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
      <<"org_id">> => A#actor.org_id,
      <<"first_seen">> => A#actor.first_seen, <<"last_seen">> => A#actor.last_seen}.

filter_out(#filter{} = F) ->
    #{<<"id">> => F#filter.id, <<"name">> => F#filter.name, <<"query">> => F#filter.query,
      <<"org_id">> => F#filter.org_id,
      <<"created_at">> => F#filter.created_at, <<"updated_at">> => F#filter.updated_at}.

%%====================================================================
%% 导入
%%====================================================================

%% @doc Opts: #{mode => replace | merge（缺省 merge）, dry_run => boolean()}
%%
%% dry_run：整套检查与落点规则照常走完，在事务末尾回滚，返回将会发生什么（新增 / 覆盖 / 跳过 / 将删除的
%% 条数，`detail'）而不写库、不重建索引、不消耗筛选器 id 计数器。出错时与正式导入同样返回错误。
%%
%% 文件内容不可信（组织管理员上传的任意 JSON），写库前先过三道：
%%   1. 形状：字段类型不对直接拒绝（以前原样落库，之后列表 / 详情一读就 500）；
%%   2. 归属：任务 id 必须是 `<project_key>-<seq>'，反馈 id 必须是 `<task_id>#<seq>'，任务 / 反馈 / 关联
%%      指向的项目必须是本次导入的项目或本作用域里已有的项目——否则组织 A 的管理员能用一个
%%      写着组织 B 项目 key 的文件覆盖 B 的任务；
%%   3. 序号：项目的 task_seq、任务的 feedback_seq 取「文件里的、库里已有的、实际最大序号」三者
%%      最大值——merge 一个旧导出时序号不会回退（回退后新建的任务会和已有任务撞号）。
-spec import(map(), map()) -> {ok, map()} | {error, term()}.
import(#{<<"format">> := ?FORMAT, <<"version">> := V} = Data, Opts) when V =:= 1; V =:= 2 ->
    Mode = maps:get(mode, Opts, merge),
    DryRun = maps:get(dry_run, Opts, false) =:= true,
    Org = bosun_scope:org_id(),
    try
        Projects = [(project_in(P))#project{org_id = org_in(P, Org)} || P <- list_in(<<"projects">>, Data)],
        Tasks = [task_in(T) || T <- list_in(<<"tasks">>, Data)],
        Fbs = [feedback_in(F) || F <- list_in(<<"feedback">>, Data)],
        Filters0 = [(filter_in(F))#filter{org_id = org_in(F, Org)} || F <- list_in(<<"filters">>, Data)],
        Actors = [(actor_in(A))#actor{org_id = org_in(A, Org)} || A <- list_in(<<"actors">>, Data)],
        Links = [link_in(L) || L <- list_in(<<"links">>, Data)],
        Counters = case Org of
                       undefined -> [{counter_in(K), N} || {K, N} <- maps:to_list(map_in(<<"counters">>, Data)), is_integer(N)];
                       _ -> []
                   end,
        Imported = maps:from_list([{P#project.key, P} || P <- Projects]),
        %% 任务 / 反馈 / 关联牵涉到的项目 key
        Referenced = lists:usort([T#task.project_key || T <- Tasks]
                                 ++ [project_of(F#feedback.task_id) || F <- Fbs]
                                 ++ lists:append([[project_of(L#link.from), project_of(L#link.to)] || L <- Links])),
        Res = bosun_store:transaction(fun() ->
            %% replace 会删掉的（删之前数）
            Deleted = case Mode of
                          replace -> scope_counts(Org);
                          merge -> null
                      end,
            %% 本组织原有筛选器的 id：replace 删数据之前取（见 place_filters/5）
            OwnFilterIds = case Org of
                               undefined -> #{};
                               _ -> maps:from_list([{F#filter.id, true} || F <- mnesia:index_read(filter, Org, #filter.org_id)])
                           end,
            case {Mode, Org} of
                {replace, undefined} ->
                    lists:foreach(fun(Tab) -> [mnesia:delete({Tab, K}) || K <- mnesia:all_keys(Tab)] end,
                                  [project, task, feedback, filter, counter, actor, link]);
                {replace, _} -> delete_org_data(Org);
                {merge, _} -> ok
            end,
            %% 别的组织已占的 key 不能覆盖；库里已有的同 key 项目留着比序号用
            Existing = lists:foldl(fun(K, Acc) ->
                case mnesia:read(project, K, write) of
                    [#project{org_id = O}] when Org =/= undefined, O =/= Org ->
                        case maps:is_key(K, Imported) of
                            true -> bosun_store:abort({conflict, key});
                            false -> bosun_store:abort({invalid, data, <<"refers to unknown project ", K/binary>>})
                        end;
                    [P] -> Acc#{K => P};
                    [] ->
                        case maps:is_key(K, Imported) of
                            true -> Acc;
                            false -> bosun_store:abort({invalid, data, <<"refers to unknown project ", K/binary>>})
                        end
                end
            end, #{}, lists:usort(maps:keys(Imported) ++ Referenced)),
            {Filters, FiltersSkipped} = case Org of
                                            undefined -> {Filters0, 0};
                                            _ -> place_filters(Filters0, Org, OwnFilterIds, Mode, new_filter_id_fun(DryRun))
                                        end,
            %% 操作者的名字是全局主键：别的组织已经登记的名字不动（不然等于把人家的操作者划过来）
            Actors1 = case Org of
                          undefined -> Actors;
                          _ -> [A || A <- Actors, actor_free(A#actor.name, Org)]
                      end,
            %% 反馈挂的任务：要么在文件里，要么库里已有
            ImportedTasks = maps:from_list([{T#task.id, T} || T <- Tasks]),
            ExistingTasks = lists:foldl(fun(Id, Acc) ->
                case mnesia:read(task, Id, write) of
                    [T] -> Acc#{Id => T};
                    [] ->
                        case maps:is_key(Id, ImportedTasks) of
                            true -> Acc;
                            false -> bosun_store:abort({invalid, data, <<"feedback refers to unknown task ", Id/binary>>})
                        end
                end
            end, #{}, lists:usort(maps:keys(ImportedTasks) ++ [F#feedback.task_id || F <- Fbs])),
            %% 序号只进不退
            MaxTaskSeq = max_by([{T#task.project_key, T#task.seq} || T <- Tasks]),
            MaxFbSeq = max_by([{F#feedback.task_id, F#feedback.seq} || F <- Fbs]),
            Projects1 = [begin
                             Base = maps:get(K, Imported, maps:get(K, Existing, undefined)),
                             Old = case maps:get(K, Existing, undefined) of undefined -> 0; #project{task_seq = S} -> S end,
                             Base#project{task_seq = lists:max([Base#project.task_seq, Old, maps:get(K, MaxTaskSeq, 0)])}
                         end || K <- lists:usort(maps:keys(Imported) ++ maps:keys(MaxTaskSeq))],
            Tasks1 = [begin
                          Base = maps:get(Id, ImportedTasks, maps:get(Id, ExistingTasks, undefined)),
                          Old = case maps:get(Id, ExistingTasks, undefined) of undefined -> 0; #task{feedback_seq = S} -> S end,
                          Base#task{feedback_seq = lists:max([Base#task.feedback_seq, Old, maps:get(Id, MaxFbSeq, 0)])}
                      end || Id <- lists:usort(maps:keys(ImportedTasks) ++ maps:keys(MaxFbSeq))],
            %% 预演用：写之前比一比库里已有什么（replace 时本组织的已经删了，都算新增）
            Detail = #{<<"projects">> => new_updated([K || K <- maps:keys(Imported)], fun(K) -> maps:is_key(K, Existing) end),
                       <<"tasks">> => new_updated(maps:keys(ImportedTasks), fun(Id) -> maps:is_key(Id, ExistingTasks) end),
                       <<"feedback">> => new_updated([F#feedback.id || F <- Fbs], fun(Id) -> mnesia:read(feedback, Id) =/= [] end),
                       <<"filters">> => (new_updated([F#filter.id || F <- Filters],
                                                     fun(Id) -> Mode =:= merge andalso maps:is_key(Id, OwnFilterIds) end))#{<<"skipped">> => FiltersSkipped},
                       <<"links">> => length(Links),
                       <<"deleted">> => Deleted},
            lists:foreach(fun(R) -> ok = mnesia:write(R) end, Projects1 ++ Tasks1 ++ Fbs ++ Filters ++ Actors1 ++ Links),
            lists:foreach(fun({K, N}) ->
                Cur = case mnesia:read(counter, K) of [#counter{value = C}] -> C; [] -> 0 end,
                ok = mnesia:write(#counter{key = K, value = max(Cur, N)})
            end, Counters),
            case DryRun of
                true -> bosun_store:abort({dry_run, Detail});
                false -> {Filters, FiltersSkipped, Detail}
            end
        end),
        case Res of
            {error, {dry_run, PlanDetail}} ->
                {ok, #{<<"mode">> => atom_to_binary(Mode, utf8), <<"dry_run">> => true, <<"detail">> => PlanDetail}};
            {ok, {Filters, FiltersSkipped, Detail}} ->
                _ = bosun_search:reindex(),
                {ok, #{<<"mode">> => atom_to_binary(Mode, utf8),
                       <<"projects">> => length(Projects), <<"tasks">> => length(Tasks),
                       <<"feedback">> => length(Fbs), <<"filters">> => length(Filters),
                       <<"filters_skipped">> => FiltersSkipped, <<"detail">> => Detail}};
            {error, _} = E -> E
        end
    catch
        throw:{bad_record, Why} -> {error, {invalid, data, Why}};
        error:{badkey, Key} -> {error, {invalid, data, <<"missing field ", (bosun_util:to_binary(Key))/binary>>}};
        error:function_clause -> {error, {invalid, data, <<"a record is missing required fields">>}};
        error:Reason -> {error, {invalid, data, bosun_util:to_binary(Reason)}}
    end;
import(#{<<"format">> := F}, _) when F =/= ?FORMAT ->
    {error, {invalid, data, <<"not a bosun export file">>}};
import(#{<<"version">> := V}, _) ->
    {error, {invalid, data, <<"unsupported export version ", (bosun_util:to_binary(V))/binary>>}};
import(_, _) ->
    {error, {invalid, data, <<"not a bosun export file">>}}.

%% 新筛选器的 id：正式导入从全局计数器取；预演不能取（计数器是脏写，回滚不了），给占位
new_filter_id_fun(true) -> fun() -> <<"f?">> end;
new_filter_id_fun(false) -> fun() -> <<"f", (integer_to_binary(bosun_store:next_id(filter)))/binary>> end.

new_updated(Keys, Exists) ->
    Updated = length([K || K <- Keys, Exists(K)]),
    #{<<"new">> => length(Keys) - Updated, <<"updated">> => Updated}.

%% 作用域里现有多少（replace 预演里的「将删除」）：组织作用域只数本组织的，系统作用域是全库
scope_counts(undefined) ->
    #{<<"projects">> => length(mnesia:all_keys(project)), <<"tasks">> => length(mnesia:all_keys(task)),
      <<"feedback">> => length(mnesia:all_keys(feedback)), <<"filters">> => length(mnesia:all_keys(filter))};
scope_counts(Org) ->
    Keys = [P#project.key || P <- mnesia:index_read(project, Org, #project.org_id)],
    TaskIds = lists:append([[T#task.id || T <- mnesia:index_read(task, K, #task.project_key)] || K <- Keys]),
    #{<<"projects">> => length(Keys), <<"tasks">> => length(TaskIds),
      <<"feedback">> => lists:sum([length(mnesia:index_read(feedback, Id, #feedback.task_id)) || Id <- TaskIds]),
      <<"filters">> => length(mnesia:index_read(filter, Org, #filter.org_id))}.

%% 组织作用域下筛选器的落点（返回 {要写的, 跳过的条数}）。筛选器 id 是全局计数器发的，
%% 文件里的 id 可能属于别的组织、也可能来自别的实例，不能照搬：
%%   1. id 是本组织原有的筛选器（replace 删之前就是）→ 沿用原 id 覆盖：同 ID 覆盖与项目 / 任务一致，
%%      replace 往返后 `?filter=fN' 书签不失效；
%%   2. 否则，本组织里已有同名同查询的（含本文件里排在前面的）→ 跳过：同一份导出合并两次不再多出一份；
%%   3. 否则发新 id。
place_filters(Fs, Org, OwnIds, Mode, NewId) ->
    Overwritten = [F#filter.id || F <- Fs, maps:is_key(F#filter.id, OwnIds)],
    %% replace 时本组织的筛选器已在本事务里删掉，不拿来比
    Present = case Mode of
                  replace -> [];
                  merge -> [{F#filter.name, F#filter.query}
                            || F <- mnesia:index_read(filter, Org, #filter.org_id),
                               not lists:member(F#filter.id, Overwritten)]
              end,
    {Out, Skipped, _} =
        lists:foldl(fun(F, {Acc, Skip, Seen}) ->
                            Key = {F#filter.name, F#filter.query},
                            case maps:is_key(F#filter.id, OwnIds) of
                                true -> {[F | Acc], Skip, Seen#{Key => true}};
                                false ->
                                    case maps:is_key(Key, Seen) of
                                        true -> {Acc, Skip + 1, Seen};
                                        false ->
                                            Id = NewId(),
                                            {[F#filter{id = Id} | Acc], Skip, Seen#{Key => true}}
                                    end
                            end
                    end, {[], 0, maps:from_list([{K, true} || K <- Present])}, Fs),
    {lists:reverse(Out), Skipped}.

%% [{Key, N}] → #{Key => 最大的 N}
max_by(Pairs) ->
    lists:foldl(fun({K, N}, Acc) -> maps:update_with(K, fun(Old) -> max(Old, N) end, N, Acc) end, #{}, Pairs).

%% 事务内：这个名字没人登记过，或者就是本组织（含孤儿）的
actor_free(Name, Org) ->
    case mnesia:read(actor, Name) of
        [#actor{org_id = O}] when O =/= undefined, O =/= Org -> false;
        _ -> true
    end.

project_of(TaskId) -> hd(binary:split(TaskId, <<"-">>)).

%% 组织作用域：一律当前组织；系统作用域：采信文件里的 org_id（没有就是孤儿）
org_in(Rec, undefined) when is_map(Rec) -> opt_bin(maps:get(<<"org_id">>, Rec, undefined), <<"org_id">>);
org_in(_Rec, Org) -> Org.

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

%%--------------------------------------------------------------------
%% 记录解析：字段类型不对就 throw {bad_record, 说明}
%%--------------------------------------------------------------------

project_in(#{<<"key">> := Key0, <<"name">> := Name} = P) ->
    Key = case bosun_id:validate_key(Key0) of
              {ok, K} when K =:= Key0 -> K;
              _ -> bad(<<"bad project key ", (bosun_util:to_binary(Key0))/binary>>)
          end,
    #project{key = Key, name = bin(Name, <<"project name">>),
             description = bin(maps:get(<<"description">>, P, <<>>), <<"project description">>),
             task_seq = nat(maps:get(<<"task_seq">>, P, 0), <<"task_seq">>),
             archived = bool(maps:get(<<"archived">>, P, false), <<"archived">>),
             created_at = int(maps:get(<<"created_at">>, P, 0), <<"created_at">>),
             updated_at = int(maps:get(<<"updated_at">>, P, 0), <<"updated_at">>)};
project_in(_) -> bad(<<"a project needs key and name">>).

task_in(#{<<"id">> := Id, <<"project_key">> := PK, <<"seq">> := Seq, <<"title">> := Title} = T) ->
    %% id / project_key / seq 三者必须自洽，否则能借别的项目的 key 写进别的项目
    case bosun_id:parse_task_id(Id) of
        {ok, Id, PK, Seq} -> ok;
        _ -> bad(<<"task id ", (bosun_util:to_binary(Id))/binary, " does not match its project_key / seq">>)
    end,
    #task{id = Id, project_key = PK, seq = Seq, title = bin(Title, <<"title">>),
          description = bin(maps:get(<<"description">>, T, <<>>), <<"description">>),
          status = status_in(maps:get(<<"status">>, T, <<"NEW">>)),
          priority = priority_in(maps:get(<<"priority">>, T, <<"medium">>)),
          labels = bins(maps:get(<<"labels">>, T, []), <<"labels">>),
          history = [history_in(H) || H <- list(maps:get(<<"history">>, T, []), <<"history">>)],
          feedback_seq = nat(maps:get(<<"feedback_seq">>, T, 0), <<"feedback_seq">>),
          assignee = opt_bin(maps:get(<<"assignee">>, T, undefined), <<"assignee">>),
          kind = case maps:get(<<"kind">>, T, <<"task">>) of <<"epic">> -> epic; _ -> task end,
          epic = opt_task_id(maps:get(<<"epic">>, T, undefined), <<"epic">>),
          created_at = int(maps:get(<<"created_at">>, T, 0), <<"created_at">>),
          updated_at = int(maps:get(<<"updated_at">>, T, 0), <<"updated_at">>)};
task_in(_) -> bad(<<"a task needs id, project_key, seq and title">>).

history_in(#{<<"to">> := To} = H) ->
    #{from => case maps:get(<<"from">>, H, null) of null -> undefined; undefined -> undefined; F -> status_in(F) end,
      to => status_in(To), actor => bin(maps:get(<<"actor">>, H, <<"user">>), <<"history actor">>),
      comment => opt_bin(maps:get(<<"comment">>, H, undefined), <<"history comment">>),
      at => int(maps:get(<<"at">>, H, 0), <<"history at">>),
      commits => case maps:get(<<"commits">>, H, []) of null -> []; L -> bins(L, <<"commits">>) end,
      tests => case maps:get(<<"tests">>, H, undefined) of
                   #{<<"passed">> := P} = M ->
                       #{command => bin(maps:get(<<"command">>, M, <<>>), <<"tests.command">>),
                         passed => bool(P, <<"tests.passed">>),
                         summary => bin(maps:get(<<"summary">>, M, <<>>), <<"tests.summary">>)};
                   _ -> undefined
               end};
history_in(_) -> bad(<<"a history entry needs `to`">>).

feedback_in(#{<<"id">> := Id, <<"task_id">> := TaskId, <<"seq">> := Seq, <<"content">> := Content} = F) ->
    case bosun_id:parse_feedback_id(Id) of
        {ok, Id, TaskId, Seq} -> ok;
        _ -> bad(<<"feedback id ", (bosun_util:to_binary(Id))/binary, " does not match its task_id / seq">>)
    end,
    Kind = case bosun_feedback:parse_kind(maps:get(<<"kind">>, F, <<"comment">>)) of
               {ok, K} -> K;
               {error, _} -> bad(<<"bad feedback kind in ", Id/binary>>)
           end,
    #feedback{id = Id, task_id = TaskId, seq = Seq,
              author = bin(maps:get(<<"author">>, F, <<"user">>), <<"author">>),
              kind = Kind, content = bin(Content, <<"content">>),
              created_at = int(maps:get(<<"created_at">>, F, 0), <<"created_at">>),
              supersedes = opt_bin(maps:get(<<"supersedes">>, F, undefined), <<"supersedes">>),
              superseded_by = opt_bin(maps:get(<<"superseded_by">>, F, undefined), <<"superseded_by">>)};
feedback_in(_) -> bad(<<"a feedback needs id, task_id, seq and content">>).

actor_in(#{<<"name">> := Name0} = A) ->
    Name = bin(Name0, <<"actor name">>),
    Kind = case bosun_actor:parse_kind(maps:get(<<"kind">>, A, <<"agent">>)) of
               undefined -> bad(<<"bad actor kind for ", Name/binary>>);
               K -> K
           end,
    #actor{name = Name, kind = Kind,
           project = opt_bin(maps:get(<<"project">>, A, undefined), <<"actor project">>),
           worktree = opt_bin(maps:get(<<"worktree">>, A, undefined), <<"actor worktree">>),
           first_seen = int(maps:get(<<"first_seen">>, A, 0), <<"first_seen">>),
           last_seen = int(maps:get(<<"last_seen">>, A, 0), <<"last_seen">>)};
actor_in(_) -> bad(<<"an actor needs a name">>).

link_in(#{<<"from">> := From0, <<"to">> := To0, <<"type">> := T} = L) ->
    From = task_id(From0, <<"link from">>),
    To = task_id(To0, <<"link to">>),
    Type = case bosun_link:parse_type(T) of
               {ok, Ty} -> Ty;
               {error, _} -> bad(<<"bad link type ", From/binary, " -> ", To/binary>>)
           end,
    #link{key = {From, To, Type}, from = From, to = To, type = Type,
          actor = bin(maps:get(<<"actor">>, L, <<"user">>), <<"link actor">>),
          created_at = int(maps:get(<<"created_at">>, L, 0), <<"created_at">>)};
link_in(_) -> bad(<<"a link needs from, to and type">>).

filter_in(#{<<"id">> := Id, <<"name">> := Name, <<"query">> := Q} = F) ->
    #filter{id = bin(Id, <<"filter id">>), name = bin(Name, <<"filter name">>), query = bin(Q, <<"filter query">>),
            created_at = int(maps:get(<<"created_at">>, F, 0), <<"created_at">>),
            updated_at = int(maps:get(<<"updated_at">>, F, 0), <<"updated_at">>)};
filter_in(_) -> bad(<<"a filter needs id, name and query">>).

%% 计数器名只认已有的原子，免得导入文件往原子表里灌垃圾
counter_in(K) when is_binary(K) ->
    try binary_to_existing_atom(K, utf8)
    catch error:badarg -> bad(<<"unknown counter ", K/binary>>)
    end.

status_in(S) ->
    case bosun_task_status:parse(S) of
        {ok, A} -> A;
        {error, _} -> bad(<<"bad status ", (bosun_util:to_binary(S))/binary>>)
    end.

priority_in(P) ->
    case string:lowercase(bosun_util:to_binary(P)) of
        <<"low">> -> low; <<"medium">> -> medium; <<"high">> -> high;
        _ -> bad(<<"bad priority ", (bosun_util:to_binary(P))/binary>>)
    end.

-spec bad(binary()) -> no_return().
bad(Why) -> throw({bad_record, Why}).

list_in(Key, Data) -> list(maps:get(Key, Data, []), Key).

map_in(Key, Data) ->
    case maps:get(Key, Data, #{}) of
        M when is_map(M) -> M;
        null -> #{};
        _ -> bad(<<Key/binary, " must be an object">>)
    end.

list(L, _What) when is_list(L) -> L;
list(null, _What) -> [];
list(_, What) -> bad(<<What/binary, " must be a list">>).

bin(B, _What) when is_binary(B) -> B;
bin(_, What) -> bad(<<What/binary, " must be a string">>).

opt_bin(null, _What) -> undefined;
opt_bin(undefined, _What) -> undefined;
opt_bin(B, What) -> bin(B, What).

bins(L, What) when is_list(L) ->
    case lists:all(fun is_binary/1, L) of
        true -> L;
        false -> bad(<<What/binary, " must be a list of strings">>)
    end;
bins(_, What) -> bad(<<What/binary, " must be a list of strings">>).

int(I, _What) when is_integer(I) -> I;
int(_, What) -> bad(<<What/binary, " must be an integer">>).

nat(I, _What) when is_integer(I), I >= 0 -> I;
nat(_, What) -> bad(<<What/binary, " must be a non-negative integer">>).

bool(B, _What) when is_boolean(B) -> B;
bool(_, What) -> bad(<<What/binary, " must be true or false">>).

task_id(V, What) ->
    case bosun_id:parse_task_id(V) of
        {ok, V, _, _} -> V;
        _ -> bad(<<What/binary, " must be a task id like BOS-12">>)
    end.

opt_task_id(null, _What) -> undefined;
opt_task_id(undefined, _What) -> undefined;
opt_task_id(V, What) -> task_id(V, What).
