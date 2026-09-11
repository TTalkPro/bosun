%%%-------------------------------------------------------------------
%%% @doc Mnesia 存储封装：schema / 表初始化、迁移、事务包装、测试重置。
%%%
%%% 领域模块只通过这里的 `transaction/1' 与 mnesia 打交道，表名与
%%% 记录定义集中在此，将来换存储只动这一个模块。
%%%-------------------------------------------------------------------
-module(bosun_store).

-include("bosun.hrl").

-export([init/0, reset_tables/0, transaction/1, abort/1, tables/0, next_id/1, data_dir/0]).

-define(TABLES, [
    {project,  record_info(fields, project),  []},
    {task,     record_info(fields, task),     [project_key, epic]},
    {feedback, record_info(fields, feedback), [task_id]},
    {filter,   record_info(fields, filter),   []},
    {counter,  record_info(fields, counter),  []},
    {actor,    record_info(fields, actor),    []},
    {link,     record_info(fields, link),     [from, to]}
]).

%% @doc 应用启动时调用：确保磁盘 schema 与各 disc_copies 表存在并已迁移。
-spec init() -> ok.
init() ->
    ok = ensure_dir(),
    ok = ensure_started(),
    ok = ensure_disc_schema(),
    lists:foreach(fun({Name, Fields, Indexes}) ->
        ensure_table(Name, Fields, Indexes, disc_copies)
    end, ?TABLES),
    ok = mnesia:wait_for_tables([N || {N, _, _} <- ?TABLES], 10000),
    ok = migrate(),
    ok.

%% @doc 测试用：删掉所有表，重建为 ram_copies（不碰磁盘）。
-spec reset_tables() -> ok.
reset_tables() ->
    ok = ensure_started(),
    lists:foreach(fun({Name, Fields, Indexes}) ->
        case lists:member(Name, mnesia:system_info(tables)) of
            true -> {atomic, ok} = mnesia:delete_table(Name);
            false -> ok
        end,
        ensure_table(Name, Fields, Indexes, ram_copies)
    end, ?TABLES),
    ok = mnesia:wait_for_tables([N || {N, _, _} <- ?TABLES], 10000),
    ok.

%% @doc 事务包装：`{atomic, R}' → `{ok, R}'，`{aborted, Reason}' → `{error, Reason}'。
%% 领域层用 `abort/1' 抛出语义错误，原样落到 `{error, Reason}'。
-spec transaction(fun(() -> term())) -> {ok, term()} | {error, term()}.
transaction(Fun) ->
    case mnesia:transaction(Fun) of
        {atomic, Result} -> {ok, Result};
        {aborted, Reason} -> {error, Reason}
    end.

-spec abort(term()) -> no_return().
abort(Reason) ->
    mnesia:abort(Reason).

%% @doc 全局自增计数器（事务内外均可）。
-spec next_id(atom()) -> pos_integer().
next_id(Key) ->
    mnesia:dirty_update_counter(counter, Key, 1).

-spec tables() -> [atom()].
tables() ->
    [N || {N, _, _} <- ?TABLES].

%% @doc 数据根目录：环境变量 BOSUN_DATA_DIR > 应用 env data_dir > "data"。
%% mnesia 用 <dir>/mnesia，搜索索引用 <dir>/search。
-spec data_dir() -> string().
data_dir() ->
    case os:getenv("BOSUN_DATA_DIR") of
        false -> application:get_env(bosun_core, data_dir, "data");
        "" -> application:get_env(bosun_core, data_dir, "data");
        Dir -> Dir
    end.

%%====================================================================
%% 内部
%%====================================================================

%% mnesia 的目录必须在它启动前定下来，且目录要先存在（change_table_copy_type 到 disc 前）。
%% 显式配置了 {mnesia, dir} 的照旧尊重。
ensure_dir() ->
    Dir = case application:get_env(mnesia, dir) of
              {ok, D} -> D;
              undefined ->
                  D = filename:join(data_dir(), "mnesia"),
                  application:set_env(mnesia, dir, D),
                  D
          end,
    ok = filelib:ensure_path(Dir).

ensure_started() ->
    case application:ensure_all_started(mnesia) of
        {ok, _} -> ok;
        {error, Reason} -> error({mnesia_start_failed, Reason})
    end.

%% mnesia 启动时若无磁盘 schema，会用 ram schema；这里就地转成 disc，
%% 不用先停再 create_schema。
ensure_disc_schema() ->
    case mnesia:table_info(schema, storage_type) of
        disc_copies -> ok;
        ram_copies ->
            case mnesia:change_table_copy_type(schema, node(), disc_copies) of
                {atomic, ok} -> ok;
                {aborted, {already_exists, _, _, _}} -> ok;
                {aborted, Reason} -> error({schema_to_disc_failed, Reason})
            end
    end.

%% 记录字段变了（增 / 删 / 重排）就 transform：按**字段名**把旧值搬到新位置，
%% 新字段一律 undefined。只要求主键仍是第一个字段。
migrate() ->
    lists:foreach(fun({Name, Fields, _}) ->
        case mnesia:table_info(Name, attributes) of
            Fields -> ok;
            Old ->
                Fun = fun(Rec) ->
                          Vals = maps:from_list(lists:zip(Old, tl(tuple_to_list(Rec)))),
                          list_to_tuple([Name | [maps:get(F, Vals, undefined) || F <- Fields]])
                      end,
                {atomic, ok} = mnesia:transform_table(Name, Fun, Fields),
                logger:notice("bosun_store: migrated table ~p ~p -> ~p", [Name, Old, Fields]),
                ok
        end
    end, ?TABLES),
    ensure_indexes().

%% 老表补新索引（create_table 只在建表时带 index）
ensure_indexes() ->
    lists:foreach(fun({Name, Fields, Indexes}) ->
        Existing = mnesia:table_info(Name, index),
        lists:foreach(fun(Attr) ->
            Pos = index_pos(Attr, Fields),
            case lists:member(Pos, Existing) of
                true -> ok;
                false ->
                    {atomic, ok} = mnesia:add_table_index(Name, Attr),
                    logger:notice("bosun_store: added index ~p on ~p", [Attr, Name])
            end
        end, Indexes)
    end, ?TABLES).

%% record 元组里字段位置 = 属性列表下标 + 2（第 1 位是记录名）
index_pos(Attr, Fields) ->
    {Attr, Idx} = lists:keyfind(Attr, 1, lists:zip(Fields, lists:seq(1, length(Fields)))),
    Idx + 1.

ensure_table(Name, Fields, Indexes, Storage) ->
    case lists:member(Name, mnesia:system_info(tables)) of
        true -> ok;
        false ->
            Def = [{attributes, Fields}, {type, set}, {index, Indexes}, {Storage, [node()]}],
            case mnesia:create_table(Name, Def) of
                {atomic, ok} -> ok;
                {aborted, {already_exists, Name}} -> ok;
                {aborted, Reason} -> error({create_table_failed, Name, Reason})
            end
    end.
