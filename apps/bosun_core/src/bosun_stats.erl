%%%-------------------------------------------------------------------
%%% @doc 项目总览统计（项目列表页的统计卡片与活动图）。
%%%
%%% 只读、按当前作用域：组织 + API key 的项目白名单都由 bosun_project:list/1 过滤，
%%% 看不到的项目不进任何数字。归档项目也算（它们的任务仍是历史的一部分），
%%% 每个项目单独给一份，前端按需显示。
%%%
%%% 「完成」= 迁移到 DONE 的历史条目（打回后再完成会再记一次）；按日分桶用调用方给的
%%% 时区偏移（分钟，东正西负），图上的日期与用户本地日历一致。
%%%-------------------------------------------------------------------
-module(bosun_stats).

-include("bosun.hrl").

-export([overview/1]).

-define(DAY_MS, 86400000).
%% 1970-01-01 的公历日数
-define(EPOCH_DAYS, 719528).
-define(OPEN, [new, in_progress, done]).

%% @doc Opts: #{days => 1..90（缺省 14）, tz_offset => 分钟（-840..840，缺省 0）,
%%             project => Key（只统计这一个项目，daily 也只算它；看不到 = not_found）, now => 毫秒（测试用）}
-spec overview(map()) -> {ok, map()} | {error, not_found | {invalid, key, binary()}}.
overview(Opts) ->
    case scope_projects(maps:get(project, Opts, undefined)) of
        {ok, Projects} -> {ok, overview(Projects, Opts)};
        {error, _} = E -> E
    end.

scope_projects(undefined) -> bosun_project:list(#{include_archived => true});
scope_projects(Key) ->
    case bosun_project:get(Key) of
        {ok, P} -> {ok, [P]};
        {error, _} = E -> E
    end.

overview(Projects, Opts) ->
    Days = clamp(maps:get(days, Opts, 14), 1, 90),
    Tz = clamp(maps:get(tz_offset, Opts, 0), -840, 840),
    Now = maps:get(now, Opts, bosun_util:now_ms()),
    TzMs = Tz * 60000,
    Today = (Now + TzMs) div ?DAY_MS,
    First = Today - Days + 1,
    BucketOf = fun(At) when is_integer(At) ->
                       D = (At + TzMs) div ?DAY_MS,
                       case D >= First andalso D =< Today of
                           true -> {ok, D - First};
                           false -> none
                       end;
                  (_) -> none
               end,
    Empty = #{created => zeros(Days), completed => zeros(Days)},
    {PerProject, Daily} =
        lists:foldl(
          fun(P, {Acc, D0}) ->
                  Key = maps:get(<<"key">>, P),
                  Tasks = mnesia:dirty_index_read(task, Key, #task.project_key),
                  {Counts, D1} = lists:foldl(fun(T, {C, D}) -> count_task(T, C, D, BucketOf) end,
                                             {empty_counts(), D0}, Tasks),
                  {Acc#{Key => Counts}, D1}
          end, {#{}, Empty}, Projects),
    Totals = maps:fold(fun(_, C, Sum) -> add_counts(C, Sum) end, empty_counts(), PerProject),
    #{<<"days">> => Days,
           <<"tz_offset">> => Tz,
           <<"projects">> => maps:map(fun(_, C) -> counts_json(C) end, PerProject),
           <<"totals">> => counts_json(Totals),
           <<"daily">> => [#{<<"date">> => date_bin(First + I),
                             <<"created">> => lists:nth(I + 1, maps:get(created, Daily)),
                             <<"completed">> => lists:nth(I + 1, maps:get(completed, Daily))}
                           || I <- lists:seq(0, Days - 1)]}.

%%====================================================================
%% 内部
%%====================================================================

count_task(#task{status = S} = T, C, Daily, BucketOf) ->
    ByStatus = maps:update_with(S, fun(N) -> N + 1 end, 1, maps:get(by_status, C)),
    %% 分面计数（列表页的执行人 / 优先级筛选显示用）；未领取记在 undefined 下
    ByAssignee = maps:update_with(T#task.assignee, fun(N) -> N + 1 end, 1, maps:get(by_assignee, C)),
    ByPriority = maps:update_with(T#task.priority, fun(N) -> N + 1 end, 1, maps:get(by_priority, C)),
    %% 未结任务按执行人（组织页的团队负载）
    OpenByAssignee = case lists:member(S, ?OPEN) of
                         true -> maps:update_with(T#task.assignee, fun(N) -> N + 1 end, 1, maps:get(open_by_assignee, C));
                         false -> maps:get(open_by_assignee, C)
                     end,
    Open = lists:member(S, ?OPEN),
    %% 阻塞 / 待回答只对还没结束的任务有意义，也省掉已结任务的链与反馈读取
    Blocked = Open andalso bosun_link:blocked(T#task.id),
    Question = Open andalso bosun_json:open_question(bosun_feedback:read_dirty(T#task.id)),
    C1 = C#{by_status := ByStatus, by_assignee := ByAssignee, by_priority := ByPriority, open_by_assignee := OpenByAssignee,
            total := maps:get(total, C) + 1,
            epics := maps:get(epics, C) + case bosun_task:kind_of(T) of epic -> 1; task -> 0 end,
            blocked := maps:get(blocked, C) + bool(Blocked),
            open_questions := maps:get(open_questions, C) + bool(Question)},
    Created = case BucketOf(T#task.created_at) of
                  {ok, I} -> bump(I, maps:get(created, Daily));
                  none -> maps:get(created, Daily)
              end,
    Completed = lists:foldl(
                  fun(#{to := done} = H, L) ->
                          case BucketOf(maps:get(at, H, undefined)) of
                              {ok, J} -> bump(J, L);
                              none -> L
                          end;
                     (_, L) -> L
                  end, maps:get(completed, Daily), T#task.history),
    {C1, Daily#{created := Created, completed := Completed}}.

empty_counts() ->
    #{by_status => #{}, by_assignee => #{}, by_priority => #{}, open_by_assignee => #{}, total => 0, epics => 0, blocked => 0, open_questions => 0}.

merge_counts(A, B) ->
    maps:fold(fun(K, N, M) -> maps:update_with(K, fun(X) -> X + N end, N, M) end, B, A).

add_counts(A, B) ->
    #{by_status => merge_counts(maps:get(by_status, A), maps:get(by_status, B)),
      by_assignee => merge_counts(maps:get(by_assignee, A), maps:get(by_assignee, B)),
      by_priority => merge_counts(maps:get(by_priority, A), maps:get(by_priority, B)),
      open_by_assignee => merge_counts(maps:get(open_by_assignee, A), maps:get(open_by_assignee, B)),
      total => maps:get(total, A) + maps:get(total, B),
      epics => maps:get(epics, A) + maps:get(epics, B),
      blocked => maps:get(blocked, A) + maps:get(blocked, B),
      open_questions => maps:get(open_questions, A) + maps:get(open_questions, B)}.

%% 六个状态都给（没有就是 0），前端不用判缺
counts_json(#{by_status := ByStatus} = C) ->
    #{<<"by_status">> => maps:from_list([{bosun_task_status:to_binary(S), maps:get(S, ByStatus, 0)}
                                         || S <- bosun_task_status:all()]),
      %% 执行人名 → 任务数（不含未领取）；未领取单列
      <<"by_assignee">> => maps:remove(undefined, maps:get(by_assignee, C)),
      <<"unassigned">> => maps:get(undefined, maps:get(by_assignee, C), 0),
      %% 同上，只数未结（NEW / IN_PROGRESS / DONE）
      <<"open_by_assignee">> => maps:remove(undefined, maps:get(open_by_assignee, C)),
      <<"open_unassigned">> => maps:get(undefined, maps:get(open_by_assignee, C), 0),
      <<"by_priority">> => maps:from_list([{atom_to_binary(P), maps:get(P, maps:get(by_priority, C), 0)} || P <- [high, medium, low]]),
      <<"total">> => maps:get(total, C),
      <<"open">> => lists:sum([maps:get(S, ByStatus, 0) || S <- ?OPEN]),
      <<"epics">> => maps:get(epics, C),
      <<"blocked">> => maps:get(blocked, C),
      <<"open_questions">> => maps:get(open_questions, C)}.

zeros(N) -> lists:duplicate(N, 0).

bump(I, L) ->
    {Before, [X | After]} = lists:split(I, L),
    Before ++ [X + 1 | After].

bool(true) -> 1;
bool(false) -> 0.

date_bin(EpochDay) ->
    {Y, M, D} = calendar:gregorian_days_to_date(EpochDay + ?EPOCH_DAYS),
    iolist_to_binary(io_lib:format("~4..0B-~2..0B-~2..0B", [Y, M, D])).

clamp(N, Lo, Hi) when is_integer(N) -> max(Lo, min(Hi, N));
clamp(_, Lo, _) -> Lo.
