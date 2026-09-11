%%%-------------------------------------------------------------------
%%% @doc 任务 Feedback：不可变；修订 = 新条 + 旧条作废。设计见 designs/04-feedback.md。
%%%-------------------------------------------------------------------
-module(bosun_feedback).

-include("bosun.hrl").

-export([add/2, revise/2, list/1, get/1, count/1]).
-export([read_dirty/1, read_in_tx/1, parse_kind/1]).

%% @doc 追加 feedback。
%% Input: #{<<"content">>, <<"author">> (缺省 user), <<"kind">> (缺省 comment)}
-spec add(term(), map()) -> {ok, map()} | {error, term()}.
add(TaskId0, Input) when is_map(Input) ->
    case bosun_id:parse_task_id(TaskId0) of
        {ok, TaskId, _, _} ->
            case validate_new(Input) of
                {ok, Content, Author, Kind} ->
                    ok = bosun_actor:touch(Author, bosun_actor:parse_kind(maps:get(<<"author_kind">>, Input, undefined))),
                    indexed(bosun_store:transaction(fun() ->
                        case mnesia:read(task, TaskId, write) of
                            [] -> bosun_store:abort(not_found);
                            [T] ->
                                Seq = T#task.feedback_seq + 1,
                                Now = bosun_util:now_ms(),
                                F = #feedback{id = bosun_id:feedback_id(TaskId, Seq),
                                              task_id = TaskId, seq = Seq,
                                              author = Author, kind = Kind,
                                              content = Content, created_at = Now,
                                              supersedes = undefined, superseded_by = undefined},
                                ok = mnesia:write(F),
                                ok = mnesia:write(T#task{feedback_seq = Seq, updated_at = Now}),
                                bosun_json:feedback_to_map(F)
                        end
                    end));
                {error, _} = E -> E
            end;
        {error, _} = E -> E
    end.

%% @doc 修订：追加一条新记录（supersedes = 旧 id），旧记录标记作废（superseded_by = 新 id）。
%% 只有原作者可以修订（actor 必须等于 author）；已作废的不能再修订（去修最新那条）。
%% 没有删除——Agent 可能已经读过并引用了旧条。
%% Input: #{<<"content">> => binary(), <<"kind">> => binary(), <<"actor">> := binary()}
-spec revise(term(), map()) -> {ok, map()} | {error, term()}.
revise(Id0, Input) when is_map(Input) ->
    case bosun_id:parse_feedback_id(Id0) of
        {ok, Id, TaskId, _} ->
            Actor = bosun_util:get_bin(<<"actor">>, Input, <<>>),
            ok = bosun_actor:touch(Actor, bosun_actor:parse_kind(maps:get(<<"actor_kind">>, Input, undefined))),
            Res = bosun_store:transaction(fun() ->
                case mnesia:read(feedback, Id, write) of
                    [] -> bosun_store:abort(not_found);
                    [#feedback{author = Author}] when Author =/= Actor ->
                        bosun_store:abort({forbidden, Author});
                    [#feedback{superseded_by = By}] when By =/= undefined ->
                        bosun_store:abort({superseded, By});
                    [Old] ->
                        New0 = apply_updates(Old, Input),
                        [T] = mnesia:read(task, TaskId, write),
                        Seq = T#task.feedback_seq + 1,
                        Now = bosun_util:now_ms(),
                        NewId = bosun_id:feedback_id(TaskId, Seq),
                        New = New0#feedback{id = NewId, seq = Seq, created_at = Now,
                                            supersedes = Id, superseded_by = undefined},
                        ok = mnesia:write(New),
                        ok = mnesia:write(Old#feedback{superseded_by = NewId}),
                        ok = mnesia:write(T#task{feedback_seq = Seq, updated_at = Now}),
                        {bosun_json:feedback_to_map(New), Id}
                end
            end),
            case Res of
                {ok, {NewMap, OldId}} ->
                    bosun_search:remove_feedback(OldId),
                    indexed({ok, NewMap});
                E -> E
            end;
        {error, _} = E -> E
    end.

%% @doc 任务的全部 feedback（含作废），按 seq 升序。
-spec list(term()) -> {ok, [map()]} | {error, term()}.
list(TaskId0) ->
    case bosun_id:parse_task_id(TaskId0) of
        {ok, TaskId, _, _} ->
            case mnesia:dirty_read(task, TaskId) of
                [] -> {error, not_found};
                [_] -> {ok, [bosun_json:feedback_to_map(F) || F <- read_dirty(TaskId)]}
            end;
        {error, _} = E -> E
    end.

-spec get(term()) -> {ok, map()} | {error, term()}.
get(Id0) ->
    case bosun_id:parse_feedback_id(Id0) of
        {ok, Id, _, _} ->
            case mnesia:dirty_read(feedback, Id) of
                [F] -> {ok, bosun_json:feedback_to_map(F)};
                [] -> {error, not_found}
            end;
        {error, _} = E -> E
    end.

%% @doc 有效（未作废）条数。
-spec count(binary()) -> non_neg_integer().
count(TaskId) ->
    length([F || F <- read_dirty(TaskId), F#feedback.superseded_by =:= undefined]).

%% @doc 记录列表（seq 升序），脏读。
-spec read_dirty(binary()) -> [#feedback{}].
read_dirty(TaskId) ->
    sort(mnesia:dirty_index_read(feedback, TaskId, #feedback.task_id)).

%% @doc 记录列表（seq 升序），事务内。
-spec read_in_tx(binary()) -> [#feedback{}].
read_in_tx(TaskId) ->
    sort(mnesia:index_read(feedback, TaskId, #feedback.task_id)).

-spec parse_kind(term()) -> {ok, comment | review | question | answer} | {error, term()}.
parse_kind(undefined) -> {ok, comment};
parse_kind(null) -> {ok, comment};
parse_kind(<<>>) -> {ok, comment};
parse_kind(K) when is_atom(K) -> parse_kind(atom_to_binary(K, utf8));
parse_kind(Bin) when is_binary(Bin) ->
    case string:lowercase(bosun_util:trim(Bin)) of
        <<"comment">> -> {ok, comment};
        <<"review">> -> {ok, review};
        <<"question">> -> {ok, question};
        <<"answer">> -> {ok, answer};
        _ -> {error, {invalid, kind, <<"expected one of comment, review, question, answer">>}}
    end;
parse_kind(_) -> {error, {invalid, kind, <<"expected one of comment, review, question, answer">>}}.

%%====================================================================
%% 内部
%%====================================================================

sort(Fs) -> lists:sort(fun(A, B) -> A#feedback.seq =< B#feedback.seq end, Fs).

indexed({ok, F} = Res) -> bosun_search:index_feedback(F), Res;
indexed(Other) -> Other.

validate_new(Input) ->
    case bosun_util:get_bin(<<"content">>, Input, <<>>) of
        <<>> -> {error, {invalid, content, <<"must not be empty">>}};
        Content ->
            case parse_kind(maps:get(<<"kind">>, Input, undefined)) of
                {ok, Kind} ->
                    Author = case bosun_util:get_bin(<<"author">>, Input, <<>>) of
                                 <<>> -> <<"user">>;
                                 A -> A
                             end,
                    {ok, Content, Author, Kind};
                {error, _} = E -> E
            end
    end.

apply_updates(F, Input) ->
    maps:fold(fun
        (<<"content">>, V, Acc) ->
            case bosun_util:trim(V) of
                <<>> -> bosun_store:abort({invalid, content, <<"must not be empty">>});
                C -> Acc#feedback{content = C}
            end;
        (<<"kind">>, V, Acc) ->
            case parse_kind(V) of
                {ok, K} -> Acc#feedback{kind = K};
                {error, R} -> bosun_store:abort(R)
            end;
        (_, _, Acc) -> Acc
    end, F, Input).
