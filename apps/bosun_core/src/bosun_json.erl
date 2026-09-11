%%%-------------------------------------------------------------------
%%% @doc 记录 ↔ 对外 map 转换与 JSON 编解码。
%%%
%%% 对外 map 的键全部是 binary，值是 JSON 友好的类型（binary / 整数 /
%%% 布尔 / null / 列表 / map），时间输出 ISO-8601（UTC）。
%%%-------------------------------------------------------------------
-module(bosun_json).

-include("bosun.hrl").

-export([encode/1, decode/1, iso8601/1,
         project_to_map/1, task_summary/2, task_full/2,
         feedback_to_map/1, history_entry/1]).

%%====================================================================
%% JSON
%%====================================================================

-spec encode(term()) -> binary().
encode(Term) ->
    iolist_to_binary(json:encode(Term, fun encoder/2)).

%% 自定义编码：undefined → null，其余交回缺省编码器。
encoder(undefined, _Encode) -> <<"null">>;
encoder(Other, Encode) -> json:encode_value(Other, Encode).

-spec decode(binary()) -> {ok, term()} | {error, invalid_json}.
decode(Bin) when is_binary(Bin) ->
    try
        {ok, json:decode(Bin)}
    catch
        error:_ -> {error, invalid_json}
    end.

-spec iso8601(integer() | undefined) -> binary() | undefined.
iso8601(undefined) -> undefined;
iso8601(Ms) when is_integer(Ms) ->
    Sys = erlang:convert_time_unit(Ms, millisecond, second),
    {{Y, Mo, D}, {H, Mi, S}} = calendar:system_time_to_universal_time(Sys, second),
    Frac = Ms rem 1000,
    iolist_to_binary(io_lib:format("~4..0B-~2..0B-~2..0BT~2..0B:~2..0B:~2..0B.~3..0BZ",
                                   [Y, Mo, D, H, Mi, S, Frac])).

%%====================================================================
%% 记录 → map
%%====================================================================

-spec project_to_map(#project{}) -> map().
project_to_map(#project{} = P) ->
    #{<<"key">> => P#project.key,
      <<"name">> => P#project.name,
      <<"description">> => P#project.description,
      <<"task_count">> => P#project.task_seq,
      <<"archived">> => P#project.archived,
      <<"created_at">> => iso8601(P#project.created_at),
      <<"updated_at">> => iso8601(P#project.updated_at)}.

%% @doc 列表用摘要：无 description / history。
%% Feedbacks 是该任务的 feedback 记录列表（按 seq 升序），用于计数与待回答标记。
-spec task_summary(#task{}, [#feedback{}]) -> map().
task_summary(#task{} = T, Feedbacks) ->
    #{<<"id">> => T#task.id,
      <<"project_key">> => T#task.project_key,
      <<"seq">> => T#task.seq,
      <<"title">> => T#task.title,
      <<"status">> => bosun_task_status:to_binary(T#task.status),
      <<"priority">> => atom_to_binary(T#task.priority, utf8),
      <<"labels">> => T#task.labels,
      <<"created_by">> => created_by(T#task.history),
      <<"created_by_kind">> => kind_bin(bosun_actor:kind_of(created_by(T#task.history))),
      <<"assignee">> => T#task.assignee,
      <<"assignee_kind">> => kind_bin(bosun_actor:kind_of(T#task.assignee)),
      <<"commits">> => commits(T#task.history),
      <<"kind">> => atom_to_binary(bosun_task:kind_of(T), utf8),
      <<"epic">> => T#task.epic,
      <<"progress">> => case bosun_task:kind_of(T) of
                            epic -> bosun_task:progress(T#task.id);
                            task -> undefined
                        end,
      <<"blocked">> => bosun_link:blocked(T#task.id),
      <<"feedback_count">> => length(active(Feedbacks)),
      <<"open_question">> => open_question(Feedbacks),
      <<"created_at">> => iso8601(T#task.created_at),
      <<"updated_at">> => iso8601(T#task.updated_at)}.

%% @doc 详情：摘要 + description + history + 内嵌 feedback。
-spec task_full(#task{}, [#feedback{}]) -> map().
task_full(#task{} = T, Feedbacks) ->
    Summary = task_summary(T, Feedbacks),
    Base = Summary#{<<"description">> => T#task.description,
                    <<"history">> => [history_entry(H) || H <- T#task.history],
                    <<"feedback">> => [feedback_to_map(F) || F <- Feedbacks],
                    <<"links">> => bosun_link:links_json(T#task.id)},
    case bosun_task:kind_of(T) of
        epic ->
            Base#{<<"children">> => [task_summary(K, bosun_feedback:read_dirty(K#task.id)) || K <- bosun_task:children(T#task.id)]};
        task ->
            Base#{<<"epic_title">> => case T#task.epic of
                                          undefined -> undefined;
                                          EpicId -> case mnesia:dirty_read(task, EpicId) of
                                                        [#task{title = Title}] -> Title;
                                                        [] -> undefined
                                                    end
                                      end}
    end.

-spec history_entry(map()) -> map().
history_entry(#{to := To, actor := Actor, at := At} = H) ->
    From = maps:get(from, H, undefined),
    #{<<"from">> => status_or_null(From),
      <<"to">> => bosun_task_status:to_binary(To),
      <<"actor">> => Actor,
      <<"comment">> => maps:get(comment, H, undefined),
      <<"commits">> => maps:get(commits, H, []),
      <<"tests">> => case maps:get(tests, H, undefined) of
                         undefined -> undefined;
                         #{command := C, passed := P, summary := S} ->
                             #{<<"command">> => C, <<"passed">> => P, <<"summary">> => S}
                     end,
      <<"at">> => iso8601(At)}.

%% 所有历史条目的提交 hash，按时间顺序去重
commits(History) ->
    All = lists:append([maps:get(commits, H, []) || H <- lists:reverse(History)]),
    lists:foldr(fun(C, Acc) -> case lists:member(C, Acc) of true -> Acc; false -> [C | Acc] end end, [], All).

status_or_null(undefined) -> undefined;
status_or_null(S) -> bosun_task_status:to_binary(S).

-spec feedback_to_map(#feedback{}) -> map().
feedback_to_map(#feedback{} = F) ->
    #{<<"id">> => F#feedback.id,
      <<"task_id">> => F#feedback.task_id,
      <<"seq">> => F#feedback.seq,
      <<"author">> => F#feedback.author,
      <<"kind">> => atom_to_binary(F#feedback.kind, utf8),
      <<"content">> => F#feedback.content,
      <<"created_at">> => iso8601(F#feedback.created_at),
      <<"supersedes">> => F#feedback.supersedes,
      <<"superseded_by">> => F#feedback.superseded_by,
      <<"status">> => case F#feedback.superseded_by of undefined -> <<"active">>; _ -> <<"superseded">> end}.

kind_bin(undefined) -> undefined;
kind_bin(K) -> atom_to_binary(K, utf8).

%% 创建记录是 history 的最后一条（history 倒序）。
created_by([]) -> undefined;
created_by(History) ->
    maps:get(actor, lists:last(History), undefined).

%% 最新一条**有效**记录是 question 即视为「待回答」；作废的不算。
open_question(Feedbacks) ->
    case active(Feedbacks) of
        [] -> false;
        Active -> (lists:last(Active))#feedback.kind =:= question
    end.

active(Feedbacks) -> [F || F <- Feedbacks, F#feedback.superseded_by =:= undefined].
