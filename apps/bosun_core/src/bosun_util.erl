%%%-------------------------------------------------------------------
%%% @doc 领域层共用的小工具：时间、字符串清理、map 取值。
%%%-------------------------------------------------------------------
-module(bosun_util).

-export([now_ms/0, trim/1, get_bin/3, get_opt_bin/2, to_binary/1,
         labels/1, to_bool/2]).

-spec now_ms() -> integer().
now_ms() -> erlang:system_time(millisecond).

%% @doc 去掉首尾空白；非二进制输入返回 <<>>。
-spec trim(term()) -> binary().
trim(Bin) when is_binary(Bin) -> string:trim(Bin);
trim(List) when is_list(List) -> trim(unicode:characters_to_binary(List));
trim(_) -> <<>>.

%% @doc 取二进制字段并 trim；缺省值 Default。
-spec get_bin(term(), map(), binary()) -> binary().
get_bin(Key, Map, Default) ->
    case maps:get(Key, Map, undefined) of
        undefined -> Default;
        null -> Default;
        V -> trim(V)
    end.

%% @doc 取可选二进制字段：不存在 / null 返回 undefined。
-spec get_opt_bin(term(), map()) -> binary() | undefined.
get_opt_bin(Key, Map) ->
    case maps:get(Key, Map, undefined) of
        undefined -> undefined;
        null -> undefined;
        V -> trim(V)
    end.

-spec to_binary(term()) -> binary().
to_binary(B) when is_binary(B) -> B;
to_binary(A) when is_atom(A) -> atom_to_binary(A, utf8);
to_binary(I) when is_integer(I) -> integer_to_binary(I);
to_binary(L) when is_list(L) -> unicode:characters_to_binary(L);
to_binary(T) -> iolist_to_binary(io_lib:format("~p", [T])).

%% @doc 标签列表清理：去空白、去空、去重、保序。接受列表或逗号分隔串。
-spec labels(term()) -> [binary()].
labels(undefined) -> [];
labels(null) -> [];
labels(Bin) when is_binary(Bin) -> labels(binary:split(Bin, <<",">>, [global]));
labels(List) when is_list(List) ->
    Cleaned = [trim(L) || L <- List],
    dedupe([L || L <- Cleaned, L =/= <<>>], []);
labels(_) -> [].

dedupe([], Acc) -> lists:reverse(Acc);
dedupe([H | T], Acc) ->
    case lists:member(H, Acc) of
        true -> dedupe(T, Acc);
        false -> dedupe(T, [H | Acc])
    end.

-spec to_bool(term(), boolean()) -> boolean().
to_bool(true, _) -> true;
to_bool(false, _) -> false;
to_bool(<<"true">>, _) -> true;
to_bool(<<"false">>, _) -> false;
to_bool(<<"1">>, _) -> true;
to_bool(<<"0">>, _) -> false;
to_bool(1, _) -> true;
to_bool(0, _) -> false;
to_bool(_, Default) -> Default.
