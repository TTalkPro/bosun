%%%-------------------------------------------------------------------
%%% @doc ID 规则：项目 Key、任务 ID `KEY-N`、Feedback ID `KEY-N#M`。
%%%
%%% 输入一律大小写不敏感（Key 部分统一转大写），序号不允许前导零。
%%%-------------------------------------------------------------------
-module(bosun_id).

-export([normalize_key/1, validate_key/1,
         task_id/2, parse_task_id/1,
         feedback_id/2, parse_feedback_id/1]).

-define(KEY_RE, "^[A-Z][A-Z0-9]{1,9}$").

%% @doc 去空白并转大写。
-spec normalize_key(term()) -> binary().
normalize_key(Key) ->
    string:uppercase(bosun_util:trim(Key)).

%% @doc 校验并归一化项目 Key。
-spec validate_key(term()) -> {ok, binary()} | {error, {invalid, key, binary()}}.
validate_key(Key0) ->
    Key = normalize_key(Key0),
    case re:run(Key, ?KEY_RE, [{capture, none}]) of
        match -> {ok, Key};
        nomatch -> {error, {invalid, key, <<"must be 2-10 uppercase letters/digits starting with a letter">>}}
    end.

-spec task_id(binary(), pos_integer()) -> binary().
task_id(Key, Seq) ->
    <<Key/binary, "-", (integer_to_binary(Seq))/binary>>.

%% @doc `<<"bos-12">>' → `{ok, <<"BOS-12">>, <<"BOS">>, 12}'。
-spec parse_task_id(term()) -> {ok, binary(), binary(), pos_integer()} | {error, {invalid, id, binary()}}.
parse_task_id(Id0) ->
    Id = normalize_key(Id0),
    case re:run(Id, "^([A-Z][A-Z0-9]{1,9})-([1-9][0-9]*)$", [{capture, all_but_first, binary}]) of
        {match, [Key, SeqBin]} ->
            Seq = binary_to_integer(SeqBin),
            {ok, task_id(Key, Seq), Key, Seq};
        nomatch ->
            {error, {invalid, id, <<"task id must look like KEY-12">>}}
    end.

-spec feedback_id(binary(), pos_integer()) -> binary().
feedback_id(TaskId, Seq) ->
    <<TaskId/binary, "#", (integer_to_binary(Seq))/binary>>.

%% @doc `<<"bos-12#3">>' → `{ok, <<"BOS-12#3">>, <<"BOS-12">>, 3}'。
-spec parse_feedback_id(term()) -> {ok, binary(), binary(), pos_integer()} | {error, {invalid, id, binary()}}.
parse_feedback_id(Id0) ->
    Id = normalize_key(Id0),
    case binary:split(Id, <<"#">>) of
        [TaskPart, SeqBin] ->
            case {parse_task_id(TaskPart), re:run(SeqBin, "^[1-9][0-9]*$", [{capture, none}])} of
                {{ok, TaskId, _, _}, match} ->
                    Seq = binary_to_integer(SeqBin),
                    {ok, feedback_id(TaskId, Seq), TaskId, Seq};
                _ ->
                    {error, {invalid, id, <<"feedback id must look like KEY-12#3">>}}
            end;
        _ ->
            {error, {invalid, id, <<"feedback id must look like KEY-12#3">>}}
    end.
