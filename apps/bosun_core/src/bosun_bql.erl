%%%-------------------------------------------------------------------
%%% @doc BQL —— Bosun 的 JQL：跨项目筛选任务的查询语言。
%%%
%%%   project = BOS AND status IN (NEW, IN_PROGRESS) AND labels = backend
%%%     AND text ~ "mcp 创建" AND updated >= -7d ORDER BY priority DESC, updated DESC
%%%
%%% 字段：project(key) · id · status · priority · labels(label) · created_by(creator, reporter) · assignee · kind · epic
%%%       · title · description · text（BM25：标题/正文/标签/反馈）· feedback（BM25：只搜反馈）
%%%       · created · updated（日期：2026-09-01 / 2026-09-01T10:00 / -7d -2w -3h / now）
%%%       · question（true = 有待回答的提问）· feedback_count
%%% 运算：= != ~ !~ > >= < <= · IN (a, b) · NOT IN (a, b) · IS EMPTY · IS NOT EMPTY
%%%       · AND OR NOT · 括号 · ORDER BY f [ASC|DESC], ...
%%% 关键字与字段名不分大小写；值可以裸写（BOS、backend）或加双引号。
%%%
%%% 求值：一次 dirty_select 拿全部任务，AST 里的 text/feedback 条件先各跑一次
%%% bosun_search 得到 id → 分数，再对每个任务求布尔；有 text 条件且没写 ORDER BY
%%% 时按相关度排序，否则缺省 updated DESC。
%%%-------------------------------------------------------------------
-module(bosun_bql).

-include("bosun.hrl").

-export([parse/1, query/2, fields/0]).

-type ast() :: {'and', ast(), ast()} | {'or', ast(), ast()} | {'not', ast()}
             | {c, atom(), atom(), term()}.
-export_type([ast/0]).

-define(FIELDS, #{
    <<"project">> => project, <<"key">> => project,
    <<"id">> => id,
    <<"status">> => status,
    <<"priority">> => priority,
    <<"labels">> => labels, <<"label">> => labels,
    <<"created_by">> => created_by, <<"creator">> => created_by, <<"reporter">> => created_by, <<"requester">> => created_by,
    <<"assignee">> => assignee,
    <<"kind">> => kind, <<"type">> => kind,
    <<"epic">> => epic, <<"parent">> => epic,
    <<"blocked">> => blocked,
    <<"depends_on">> => depends_on, <<"blocks">> => blocks,
    <<"replaces">> => replaces, <<"replaced_by">> => replaced_by,
    <<"title">> => title,
    <<"description">> => description,
    <<"text">> => text,
    <<"feedback">> => feedback,
    <<"created">> => created, <<"updated">> => updated,
    <<"question">> => question, <<"open_question">> => question,
    <<"feedback_count">> => feedback_count
}).

%% @doc 可用字段（给 UI 的提示面板）。
-spec fields() -> [binary()].
fields() -> lists:usort(maps:keys(?FIELDS)).

%%====================================================================
%% 入口
%%====================================================================

%% @doc 解析。返回 {ok, #{where => ast() | true, order => [{Field, asc|desc}]}}。
-spec parse(binary()) -> {ok, map()} | {error, {invalid, query, binary()}}.
parse(Bin) when is_binary(Bin) ->
    try
        Tokens = tokenize(Bin),
        {Where, Rest} = case Tokens of
                            [] -> {true, []};
                            [{kw, <<"ORDER">>} | _] -> {true, Tokens};
                            _ -> parse_or(Tokens)
                        end,
        Order = parse_order(Rest),
        {ok, #{where => Where, order => Order}}
    catch
        throw:{bql, Msg} -> {error, {invalid, query, Msg}}
    end.

%% @doc 执行。Opts（binary 键）: limit（缺省 100，上限 500）、offset
-spec query(binary(), map()) -> {ok, map()} | {error, term()}.
query(Bin, Opts) ->
    case parse(bosun_util:to_binary(Bin)) of
        {ok, #{where := Where, order := Order}} ->
            Ctx = prepare(Where),
            All = bosun_task:visible(mnesia:dirty_select(task, [{'_', [], ['$_']}])),
            Matched = [T || T <- All, eval(Where, T, Ctx)],
            Sorted = sort(Matched, Order, Ctx),
            Limit = clamp(to_int(maps:get(<<"limit">>, Opts, 100), 100), 1, 500),
            Offset = max(0, to_int(maps:get(<<"offset">>, Opts, 0), 0)),
            Page = lists:sublist(Sorted, Offset + 1, Limit),
            {ok, #{<<"tasks">> => [bosun_json:task_summary(T, feedback_of(T, Ctx)) || T <- Page],
                   <<"total">> => length(Matched),
                   <<"order">> => [#{<<"field">> => atom_to_binary(F, utf8), <<"dir">> => atom_to_binary(D, utf8)}
                                   || {F, D} <- effective_order(Order, Ctx)]}};
        {error, _} = E -> E
    end.

%%====================================================================
%% 词法
%%====================================================================

tokenize(Bin) -> tokenize(Bin, []).

tokenize(<<>>, Acc) -> lists:reverse(Acc);
tokenize(<<C, R/binary>>, Acc) when C =:= $\s; C =:= $\t; C =:= $\n; C =:= $\r -> tokenize(R, Acc);
tokenize(<<"(", R/binary>>, Acc) -> tokenize(R, [lparen | Acc]);
tokenize(<<")", R/binary>>, Acc) -> tokenize(R, [rparen | Acc]);
tokenize(<<",", R/binary>>, Acc) -> tokenize(R, [comma | Acc]);
tokenize(<<"!=", R/binary>>, Acc) -> tokenize(R, [{op, ne} | Acc]);
tokenize(<<"!~", R/binary>>, Acc) -> tokenize(R, [{op, nmatch} | Acc]);
tokenize(<<">=", R/binary>>, Acc) -> tokenize(R, [{op, gte} | Acc]);
tokenize(<<"<=", R/binary>>, Acc) -> tokenize(R, [{op, lte} | Acc]);
tokenize(<<"=", R/binary>>, Acc) -> tokenize(R, [{op, eq} | Acc]);
tokenize(<<"~", R/binary>>, Acc) -> tokenize(R, [{op, match} | Acc]);
tokenize(<<">", R/binary>>, Acc) -> tokenize(R, [{op, gt} | Acc]);
tokenize(<<"<", R/binary>>, Acc) -> tokenize(R, [{op, lt} | Acc]);
tokenize(<<"\"", R/binary>>, Acc) ->
    {Str, R2} = quoted(R, <<>>),
    tokenize(R2, [{str, Str} | Acc]);
tokenize(Bin, Acc) ->
    {Word, R} = word(Bin, <<>>),
    Token = case string:uppercase(Word) of
                K when K =:= <<"AND">>; K =:= <<"OR">>; K =:= <<"NOT">>; K =:= <<"IN">>;
                       K =:= <<"IS">>; K =:= <<"EMPTY">>; K =:= <<"NULL">>; K =:= <<"ORDER">>;
                       K =:= <<"BY">>; K =:= <<"ASC">>; K =:= <<"DESC">> -> {kw, K};
                _ -> {word, Word}
            end,
    tokenize(R, [Token | Acc]).

quoted(<<>>, _) -> throw({bql, <<"unterminated string">>});
quoted(<<"\\\"", R/binary>>, Acc) -> quoted(R, <<Acc/binary, "\"">>);
quoted(<<"\"", R/binary>>, Acc) -> {Acc, R};
quoted(<<C/utf8, R/binary>>, Acc) -> quoted(R, <<Acc/binary, C/utf8>>).

word(<<>>, Acc) -> {Acc, <<>>};
word(<<C, _/binary>> = Bin, Acc) when C =:= $\s; C =:= $\t; C =:= $\n; C =:= $\r; C =:= $(; C =:= $);
                                     C =:= $,; C =:= $=; C =:= $!; C =:= $~; C =:= $<; C =:= $>; C =:= $" ->
    case Acc of
        <<>> -> throw({bql, <<"unexpected character '", C, "'">>});
        _ -> {Acc, Bin}
    end;
word(<<C/utf8, R/binary>>, Acc) -> word(R, <<Acc/binary, C/utf8>>).

%%====================================================================
%% 语法（递归下降）
%%====================================================================

parse_or(Tokens) ->
    {L, R} = parse_and(Tokens),
    parse_or_rest(L, R).
parse_or_rest(L, [{kw, <<"OR">>} | R]) ->
    {Rt, R2} = parse_and(R),
    parse_or_rest({'or', L, Rt}, R2);
parse_or_rest(L, R) -> {L, R}.

parse_and(Tokens) ->
    {L, R} = parse_not(Tokens),
    parse_and_rest(L, R).
parse_and_rest(L, [{kw, <<"AND">>} | R]) ->
    {Rt, R2} = parse_not(R),
    parse_and_rest({'and', L, Rt}, R2);
parse_and_rest(L, R) -> {L, R}.

parse_not([{kw, <<"NOT">>} | R]) ->
    {E, R2} = parse_not(R),
    {{'not', E}, R2};
parse_not([lparen | R]) ->
    {E, R2} = parse_or(R),
    case R2 of
        [rparen | R3] -> {E, R3};
        _ -> throw({bql, <<"expected ')'">>})
    end;
parse_not([{word, FieldName} | R]) ->
    Field = case maps:get(string:lowercase(FieldName), ?FIELDS, undefined) of
                undefined -> throw({bql, <<"unknown field '", FieldName/binary, "'">>});
                F -> F
            end,
    parse_cond(Field, R);
parse_not([]) -> throw({bql, <<"unexpected end of query">>});
parse_not([T | _]) -> throw({bql, <<"unexpected token ", (token_text(T))/binary>>}).

parse_cond(Field, [{op, Op} | R]) ->
    {V, R2} = parse_value(R),
    {{c, Field, Op, coerce(Field, Op, V)}, R2};
parse_cond(Field, [{kw, <<"IN">>}, lparen | R]) ->
    {Vs, R2} = parse_list(R, []),
    {{c, Field, in, [coerce(Field, in, V) || V <- Vs]}, R2};
parse_cond(Field, [{kw, <<"NOT">>}, {kw, <<"IN">>}, lparen | R]) ->
    {Vs, R2} = parse_list(R, []),
    {{c, Field, not_in, [coerce(Field, in, V) || V <- Vs]}, R2};
parse_cond(Field, [{kw, <<"IS">>}, {kw, <<"NOT">>}, {kw, E} | R]) when E =:= <<"EMPTY">>; E =:= <<"NULL">> ->
    {{'not', {c, Field, empty, true}}, R};
parse_cond(Field, [{kw, <<"IS">>}, {kw, E} | R]) when E =:= <<"EMPTY">>; E =:= <<"NULL">> ->
    {{c, Field, empty, true}, R};
parse_cond(Field, _) ->
    throw({bql, <<"expected an operator after '", (atom_to_binary(Field, utf8))/binary, "'">>}).

parse_value([{word, W} | R]) -> {W, R};
parse_value([{str, S} | R]) -> {S, R};
parse_value([{kw, K} | R]) -> {K, R};   %% 允许 status = NULL 这类被当关键字的裸词
parse_value(_) -> throw({bql, <<"expected a value">>}).

parse_list(Tokens, Acc) ->
    {V, R} = parse_value(Tokens),
    case R of
        [comma | R2] -> parse_list(R2, [V | Acc]);
        [rparen | R2] -> {lists:reverse([V | Acc]), R2};
        _ -> throw({bql, <<"expected ',' or ')' in list">>})
    end.

parse_order([]) -> [];
parse_order([{kw, <<"ORDER">>}, {kw, <<"BY">>} | R]) -> parse_order_items(R, []);
parse_order([T | _]) -> throw({bql, <<"unexpected token ", (token_text(T))/binary>>}).

parse_order_items([{word, F} | R], Acc) ->
    Field = case maps:get(string:lowercase(F), ?FIELDS, undefined) of
                undefined -> throw({bql, <<"unknown field '", F/binary, "' in ORDER BY">>});
                Fd -> Fd
            end,
    {Dir, R2} = case R of
                    [{kw, <<"ASC">>} | R1] -> {asc, R1};
                    [{kw, <<"DESC">>} | R1] -> {desc, R1};
                    _ -> {asc, R}
                end,
    case R2 of
        [comma | R3] -> parse_order_items(R3, [{Field, Dir} | Acc]);
        [] -> lists:reverse([{Field, Dir} | Acc]);
        [T | _] -> throw({bql, <<"unexpected token ", (token_text(T))/binary, " after ORDER BY">>})
    end;
parse_order_items(_, _) -> throw({bql, <<"expected a field after ORDER BY">>}).

token_text(lparen) -> <<"'('">>;
token_text(rparen) -> <<"')'">>;
token_text(comma) -> <<"','">>;
token_text({op, Op}) -> <<"'", (op_text(Op))/binary, "'">>;
token_text({kw, K}) -> <<"'", K/binary, "'">>;
token_text({word, W}) -> <<"'", W/binary, "'">>;
token_text({str, S}) -> <<"\"", S/binary, "\"">>.

op_text(eq) -> <<"=">>; op_text(ne) -> <<"!=">>; op_text(match) -> <<"~">>; op_text(nmatch) -> <<"!~">>;
op_text(gt) -> <<">">>; op_text(gte) -> <<">=">>; op_text(lt) -> <<"<">>; op_text(lte) -> <<"<=">>.

%%====================================================================
%% 值归一 + 运算符合法性
%%====================================================================

coerce(project, Op, V) when Op =:= eq; Op =:= ne; Op =:= in -> bosun_id:normalize_key(V);
coerce(id, Op, V) when Op =:= eq; Op =:= ne; Op =:= in; Op =:= match; Op =:= nmatch -> string:uppercase(V);
coerce(status, Op, V) when Op =:= eq; Op =:= ne; Op =:= in ->
    case bosun_task_status:parse(V) of
        {ok, S} -> S;
        {error, _} -> throw({bql, <<"invalid status '", V/binary, "'">>})
    end;
coerce(priority, Op, V) when Op =:= eq; Op =:= ne; Op =:= in; Op =:= gt; Op =:= gte; Op =:= lt; Op =:= lte ->
    case string:lowercase(V) of
        <<"low">> -> low; <<"medium">> -> medium; <<"high">> -> high;
        _ -> throw({bql, <<"invalid priority '", V/binary, "'">>})
    end;
coerce(labels, Op, V) when Op =:= eq; Op =:= ne; Op =:= in; Op =:= match; Op =:= nmatch -> string:lowercase(V);
coerce(created_by, Op, V) when Op =:= eq; Op =:= ne; Op =:= in; Op =:= match; Op =:= nmatch -> string:lowercase(V);
coerce(assignee, Op, V) when Op =:= eq; Op =:= ne; Op =:= in; Op =:= match; Op =:= nmatch -> string:lowercase(V);
coerce(kind, Op, V) when Op =:= eq; Op =:= ne; Op =:= in ->
    case bosun_task:parse_kind(V) of
        {ok, K} -> K;
        {error, _} -> throw({bql, <<"kind expects task or epic">>})
    end;
coerce(epic, Op, V) when Op =:= eq; Op =:= ne; Op =:= in -> string:uppercase(V);
coerce(blocked, Op, V) when Op =:= eq; Op =:= ne ->
    case string:lowercase(V) of
        <<"true">> -> true; <<"yes">> -> true;
        <<"false">> -> false; <<"no">> -> false;
        _ -> throw({bql, <<"blocked expects true or false">>})
    end;
coerce(F, Op, V) when (F =:= depends_on orelse F =:= blocks orelse F =:= replaces orelse F =:= replaced_by),
                      (Op =:= eq orelse Op =:= ne orelse Op =:= in) -> string:uppercase(V);
coerce(title, Op, V) when Op =:= eq; Op =:= ne; Op =:= match; Op =:= nmatch -> string:lowercase(V);
coerce(description, Op, V) when Op =:= match; Op =:= nmatch -> string:lowercase(V);
coerce(text, Op, V) when Op =:= match; Op =:= nmatch -> V;
coerce(feedback, Op, V) when Op =:= match; Op =:= nmatch -> V;
coerce(F, Op, V) when (F =:= created orelse F =:= updated),
                      (Op =:= gt orelse Op =:= gte orelse Op =:= lt orelse Op =:= lte) -> date_ms(V);
coerce(question, Op, V) when Op =:= eq; Op =:= ne ->
    case string:lowercase(V) of
        <<"true">> -> true; <<"yes">> -> true; <<"open">> -> true;
        <<"false">> -> false; <<"no">> -> false;
        _ -> throw({bql, <<"question expects true or false">>})
    end;
coerce(feedback_count, Op, V) when Op =:= eq; Op =:= ne; Op =:= gt; Op =:= gte; Op =:= lt; Op =:= lte ->
    try binary_to_integer(V) catch error:badarg -> throw({bql, <<"feedback_count expects a number">>}) end;
coerce(Field, Op, _) ->
    throw({bql, <<"operator ", (op_text_any(Op))/binary, " not supported for ", (atom_to_binary(Field, utf8))/binary>>}).

op_text_any(in) -> <<"IN">>;
op_text_any(Op) -> op_text(Op).

%% 日期：YYYY-MM-DD / YYYY-MM-DDTHH:MM[:SS] / now / -7d -2w -12h -30m
date_ms(V0) ->
    V = string:lowercase(V0),
    Now = bosun_util:now_ms(),
    case re:run(V, "^-?(\\d+)([mhdw])$", [{capture, all_but_first, binary}]) of
        {match, [N, U]} ->
            Unit = case U of <<"m">> -> 60000; <<"h">> -> 3600000; <<"d">> -> 86400000; <<"w">> -> 604800000 end,
            Now - binary_to_integer(N) * Unit;
        nomatch when V =:= <<"now">> -> Now;
        nomatch ->
            case re:run(V, "^(\\d{4})-(\\d{2})-(\\d{2})(?:t(\\d{2}):(\\d{2})(?::(\\d{2}))?)?$", [{capture, all_but_first, binary}]) of
                {match, [Y, Mo, D | Rest]} ->
                    [H, Mi, S] = pad3([binary_to_integer(X) || X <- Rest, X =/= <<>>]),
                    Secs = calendar:datetime_to_gregorian_seconds(
                             {{binary_to_integer(Y), binary_to_integer(Mo), binary_to_integer(D)}, {H, Mi, S}})
                           - calendar:datetime_to_gregorian_seconds({{1970, 1, 1}, {0, 0, 0}}),
                    Secs * 1000;
                nomatch -> throw({bql, <<"invalid date '", V0/binary, "' (use 2026-09-01, -7d, now)">>})
            end
    end.

pad3(L) -> L ++ lists:duplicate(3 - length(L), 0).

%%====================================================================
%% 求值
%%====================================================================

%% 预先跑完所有全文条件：#{ {text|feedback, Query} => #{TaskId => Score} }
prepare(Where) ->
    Conds = collect_search(Where, []),
    Searches = lists:foldl(fun({Kind, Q}, Acc) ->
        case maps:is_key({Kind, Q}, Acc) of
            true -> Acc;
            false ->
                Kinds = case Kind of text -> [task, feedback]; feedback -> [feedback] end,
                Scores = case bosun_search:search(Q, #{kinds => Kinds, limit => 5000}) of
                             {ok, Hits} -> lists:foldl(fun(#{task_id := Id, score := S}, M) ->
                                                           maps:update_with(Id, fun(Old) -> max(Old, S) end, S, M)
                                                       end, #{}, Hits);
                             {error, _} -> #{}
                         end,
                Acc#{{Kind, Q} => Scores}
        end
    end, #{}, Conds),
    #{searches => Searches, feedback => #{}}.

collect_search({'and', A, B}, Acc) -> collect_search(B, collect_search(A, Acc));
collect_search({'or', A, B}, Acc) -> collect_search(B, collect_search(A, Acc));
collect_search({'not', A}, Acc) -> collect_search(A, Acc);
collect_search({c, F, _, V}, Acc) when F =:= text; F =:= feedback -> [{F, V} | Acc];
collect_search(_, Acc) -> Acc.

eval(true, _, _) -> true;
eval({'and', A, B}, T, Ctx) -> eval(A, T, Ctx) andalso eval(B, T, Ctx);
eval({'or', A, B}, T, Ctx) -> eval(A, T, Ctx) orelse eval(B, T, Ctx);
eval({'not', A}, T, Ctx) -> not eval(A, T, Ctx);
eval({c, Field, Op, V}, T, Ctx) -> test(Field, Op, V, T, Ctx).

test(project, Op, V, T, _) -> cmp(Op, T#task.project_key, V);
test(id, match, V, T, _) -> binary:match(T#task.id, V) =/= nomatch;
test(id, nmatch, V, T, _) -> binary:match(T#task.id, V) =:= nomatch;
test(id, Op, V, T, _) -> cmp(Op, T#task.id, V);
test(status, Op, V, T, _) -> cmp(Op, T#task.status, V);
test(priority, Op, V, T, _) -> cmp_ord(Op, prio_rank(T#task.priority), prio_rank(V));
test(labels, empty, _, T, _) -> T#task.labels =:= [];
test(labels, eq, V, T, _) -> lists:member(V, lower(T#task.labels));
test(labels, ne, V, T, _) -> not lists:member(V, lower(T#task.labels));
test(labels, in, Vs, T, _) -> lists:any(fun(L) -> lists:member(L, Vs) end, lower(T#task.labels));
test(labels, not_in, Vs, T, _) -> not lists:any(fun(L) -> lists:member(L, Vs) end, lower(T#task.labels));
test(labels, match, V, T, _) -> lists:any(fun(L) -> binary:match(L, V) =/= nomatch end, lower(T#task.labels));
test(labels, nmatch, V, T, _) -> not lists:any(fun(L) -> binary:match(L, V) =/= nomatch end, lower(T#task.labels));
test(created_by, match, V, T, _) -> binary:match(string:lowercase(creator(T)), V) =/= nomatch;
test(created_by, nmatch, V, T, _) -> binary:match(string:lowercase(creator(T)), V) =:= nomatch;
test(created_by, Op, V, T, _) -> cmp(Op, string:lowercase(creator(T)), V);
test(assignee, empty, _, T, _) -> T#task.assignee =:= undefined;
test(assignee, match, V, T, _) -> binary:match(assignee_lc(T), V) =/= nomatch;
test(assignee, nmatch, V, T, _) -> binary:match(assignee_lc(T), V) =:= nomatch;
test(assignee, Op, V, T, _) -> cmp(Op, assignee_lc(T), V);
test(kind, Op, V, T, _) -> cmp(Op, bosun_task:kind_of(T), V);
test(epic, empty, _, T, _) -> T#task.epic =:= undefined;
test(epic, Op, V, T, _) -> cmp(Op, case T#task.epic of undefined -> <<>>; E -> E end, V);
test(blocked, Op, V, T, _) -> cmp(Op, bosun_link:blocked(T#task.id), V);
test(F, empty, _, T, _) when F =:= depends_on; F =:= blocks; F =:= replaces; F =:= replaced_by ->
    linked(F, T) =:= [];
test(F, Op, V, T, _) when F =:= depends_on; F =:= blocks; F =:= replaces; F =:= replaced_by ->
    Ids = linked(F, T),
    case Op of
        eq -> lists:member(V, Ids);
        ne -> not lists:member(V, Ids);
        in -> lists:any(fun(X) -> lists:member(X, V) end, Ids);
        not_in -> not lists:any(fun(X) -> lists:member(X, V) end, Ids)
    end;
test(title, match, V, T, _) -> binary:match(string:lowercase(T#task.title), V) =/= nomatch;
test(title, nmatch, V, T, _) -> binary:match(string:lowercase(T#task.title), V) =:= nomatch;
test(title, Op, V, T, _) -> cmp(Op, string:lowercase(T#task.title), V);
test(description, empty, _, T, _) -> T#task.description =:= <<>>;
test(description, match, V, T, _) -> binary:match(string:lowercase(T#task.description), V) =/= nomatch;
test(description, nmatch, V, T, _) -> binary:match(string:lowercase(T#task.description), V) =:= nomatch;
test(Kind, match, V, T, #{searches := S}) when Kind =:= text; Kind =:= feedback ->
    maps:is_key(T#task.id, maps:get({Kind, V}, S, #{}));
test(Kind, nmatch, V, T, #{searches := S}) when Kind =:= text; Kind =:= feedback ->
    not maps:is_key(T#task.id, maps:get({Kind, V}, S, #{}));
test(created, Op, V, T, _) -> cmp_ord(Op, T#task.created_at, V);
test(updated, Op, V, T, _) -> cmp_ord(Op, T#task.updated_at, V);
test(question, Op, V, T, Ctx) -> cmp(Op, open_question(T, Ctx), V);
test(feedback_count, Op, V, T, _) -> cmp_ord(Op, T#task.feedback_seq, V);
test(feedback, empty, _, T, _) -> T#task.feedback_seq =:= 0;
test(Field, Op, _, _, _) ->
    throw({bql, <<"operator ", (op_text_any(Op))/binary, " not supported for ", (atom_to_binary(Field, utf8))/binary>>}).

cmp(eq, A, B) -> A =:= B;
cmp(ne, A, B) -> A =/= B;
cmp(in, A, Bs) -> lists:member(A, Bs);
cmp(not_in, A, Bs) -> not lists:member(A, Bs);
cmp(Op, A, B) -> cmp_ord(Op, A, B).

cmp_ord(eq, A, B) -> A =:= B;
cmp_ord(ne, A, B) -> A =/= B;
cmp_ord(gt, A, B) -> A > B;
cmp_ord(gte, A, B) -> A >= B;
cmp_ord(lt, A, B) -> A < B;
cmp_ord(lte, A, B) -> A =< B;
cmp_ord(in, A, Bs) -> lists:member(A, Bs);
cmp_ord(not_in, A, Bs) -> not lists:member(A, Bs).

prio_rank(low) -> 1; prio_rank(medium) -> 2; prio_rank(high) -> 3.
%% 关联字段：depends_on / replaces = 出链对端；blocks / replaced_by = 入链对端
linked(F, #task{id = Id}) ->
    {Type, Dir} = case F of
                      depends_on -> {depends_on, out}; blocks -> {depends_on, in};
                      replaces -> {replaces, out}; replaced_by -> {replaces, in}
                  end,
    [case Dir of out -> L#link.to; in -> L#link.from end
     || L <- bosun_link:of_task(Id), L#link.type =:= Type,
        (Dir =:= out andalso L#link.from =:= Id) orelse (Dir =:= in andalso L#link.to =:= Id)].

assignee_lc(#task{assignee = undefined}) -> <<>>;
assignee_lc(#task{assignee = A}) -> string:lowercase(A).
lower(L) -> [string:lowercase(X) || X <- L].
creator(#task{history = H}) ->
    case H of [] -> <<>>; _ -> maps:get(actor, lists:last(H), <<>>) end.

%% feedback 只在需要时读；单人规模 feedback 表很小，直接脏读
feedback_of(T, _Ctx) -> bosun_feedback:read_dirty(T#task.id).
open_question(T, Ctx) ->
    Active = [F || F <- feedback_of(T, Ctx), F#feedback.superseded_by =:= undefined],
    case Active of
        [] -> false;
        Fs -> (lists:last(Fs))#feedback.kind =:= question
    end.

%%====================================================================
%% 排序
%%====================================================================

effective_order([], #{searches := S}) when map_size(S) > 0 -> [{score, desc}];
effective_order([], _) -> [{updated, desc}];
effective_order(Order, _) -> Order.

sort(Tasks, Order, Ctx) ->
    Keys = effective_order(Order, Ctx),
    lists:sort(fun(A, B) -> compare(Keys, A, B, Ctx) end, Tasks).

compare([], A, B, _) -> A#task.updated_at >= B#task.updated_at;
compare([{F, Dir} | Rest], A, B, Ctx) ->
    Ka = sort_key(F, A, Ctx), Kb = sort_key(F, B, Ctx),
    if Ka =:= Kb -> compare(Rest, A, B, Ctx);
       Dir =:= asc -> Ka < Kb;
       true -> Ka > Kb
    end.

sort_key(score, T, #{searches := S}) ->
    lists:sum([maps:get(T#task.id, M, 0.0) || M <- maps:values(S)]);
sort_key(created, T, _) -> T#task.created_at;
sort_key(updated, T, _) -> T#task.updated_at;
sort_key(priority, T, _) -> prio_rank(T#task.priority);
sort_key(status, T, _) -> status_rank(T#task.status);
sort_key(id, T, _) -> {T#task.project_key, T#task.seq};
sort_key(project, T, _) -> {T#task.project_key, T#task.seq};
sort_key(title, T, _) -> string:lowercase(T#task.title);
sort_key(created_by, T, _) -> string:lowercase(creator(T));
sort_key(assignee, T, _) -> assignee_lc(T);
sort_key(kind, T, _) -> bosun_task:kind_of(T);
sort_key(blocked, T, _) -> bosun_link:blocked(T#task.id);
sort_key(epic, T, _) -> case T#task.epic of undefined -> <<>>; E -> E end;
sort_key(feedback_count, T, _) -> T#task.feedback_seq;
sort_key(_, T, _) -> T#task.updated_at.

status_rank(new) -> 1; status_rank(in_progress) -> 2; status_rank(done) -> 3;
status_rank(verified) -> 4; status_rank(rejected) -> 5; status_rank(cancelled) -> 6.

to_int(I, _) when is_integer(I) -> I;
to_int(B, D) when is_binary(B) -> try binary_to_integer(B) catch error:badarg -> D end;
to_int(_, D) -> D.
clamp(V, Lo, Hi) -> max(Lo, min(Hi, V)).
