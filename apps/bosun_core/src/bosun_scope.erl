%%%-------------------------------------------------------------------
%%% @doc 当前主体（principal）与数据作用域。设计见 designs/13-org-auth.md §3.1。
%%%
%%% 主体存在**进程字典**里：REST 中间件每个请求设一次（cowboy 一请求一进程），
%%% MCP 在每次工具调用前从会话身份设。领域模块读它决定「看哪个组织的数据」：
%%%
%%%   - `undefined'（没设）= 系统作用域：不过滤，保持 13 之前的行为。shell、迁移脚本、
%%%     纯领域 eunit 都跑在这个作用域下。
%%%   - 设了主体：只看 `org_id' 相同的项目 / 筛选器 / 操作者；别的组织的东西一律
%%%     `not_found'，不泄露存在性。
%%%
%%% 主体 map：#{user_id, org_id, name, email, role,
%%%             via => session | api_key, key_id,
%%%             scopes => [binary()] | undefined, project_keys => [binary()] | undefined}
%%%-------------------------------------------------------------------
-module(bosun_scope).

-include("bosun.hrl").

-export([set/1, get/0, clear/0, org_id/0, user_id/0, actor_name/0, role/0,
         scopes/0, has_scope/1, project_visible/1, filter_org/1, with/2]).

-type principal() :: #{user_id := binary(), org_id := binary(), name := binary(),
                       email := binary(), role := admin | member,
                       via := session | api_key, key_id => binary() | undefined,
                       scopes => [binary()] | undefined,
                       project_keys => [binary()] | undefined}.
-export_type([principal/0]).

-define(KEY, bosun_scope).

-spec set(principal() | undefined) -> ok.
set(undefined) -> clear();
set(P) when is_map(P) -> put(?KEY, P), ok.

-spec get() -> principal() | undefined.
get() -> erlang:get(?KEY).

-spec clear() -> ok.
clear() -> erase(?KEY), ok.

%% @doc 当前组织；系统作用域下 undefined。
-spec org_id() -> binary() | undefined.
org_id() ->
    case erlang:get(?KEY) of
        #{org_id := Org} -> Org;
        _ -> undefined
    end.

-spec user_id() -> binary() | undefined.
user_id() ->
    case erlang:get(?KEY) of
        #{user_id := U} -> U;
        _ -> undefined
    end.

%% @doc 主体的署名（显示名）；没有主体时 undefined，调用方自己给缺省。
-spec actor_name() -> binary() | undefined.
actor_name() ->
    case erlang:get(?KEY) of
        #{name := N} -> N;
        _ -> undefined
    end.

-spec role() -> admin | member | undefined.
role() ->
    case erlang:get(?KEY) of
        #{role := R} -> R;
        _ -> undefined
    end.

%% @doc 当前主体的 key scopes。系统作用域 / 旧 session 主体拥有一切；
%% API key 的 scopes 缺失时视为 legacy full-access，便于表结构平滑迁移。
-spec scopes() -> [binary()] | undefined.
scopes() ->
    case erlang:get(?KEY) of
        #{scopes := undefined} -> undefined;
        #{scopes := Scopes} when is_list(Scopes) -> Scopes;
        _ -> undefined
    end.

-spec has_scope(binary()) -> boolean().
has_scope(Scope) ->
    case scopes() of
        undefined -> true;
        Scopes -> lists:member(<<"*">>, Scopes) orelse lists:member(Scope, Scopes)
    end.

%% @doc 项目（按 key）在当前作用域下是否可见。不存在的项目也返回 false。
-spec project_visible(binary()) -> boolean().
project_visible(Key0) ->
    Key = string:uppercase(bosun_util:to_binary(Key0)),
    case project_allowed(Key) of
        false -> false;
        true ->
            case mnesia:dirty_read(project, Key) of
                [#project{org_id = Org}] -> org_matches(Org);
                [] -> false
            end
    end.

%% @doc 记录上的 org_id 是否属于当前作用域（系统作用域下一律 true）。
-spec filter_org(binary() | undefined) -> boolean().
filter_org(Org) -> org_matches(Org).

%% @doc 在给定主体下执行 Fun，之后恢复原状（测试与后台任务用）。
-spec with(principal() | undefined, fun(() -> T)) -> T.
with(P, Fun) ->
    Old = erlang:get(?KEY),
    set(P),
    try Fun()
    after
        case Old of undefined -> clear(); _ -> set(Old) end
    end.

org_matches(RecordOrg) ->
    case org_id() of
        undefined -> true;
        Org -> RecordOrg =:= Org
    end.

%% API key 可以只授权一部分项目；undefined / 空列表表示组织内全部可见。
project_allowed(Key) ->
    case erlang:get(?KEY) of
        #{project_keys := undefined} -> true;
        #{project_keys := Keys} when is_list(Keys) ->
            Normalized = [string:uppercase(bosun_util:to_binary(K)) ||
                             K <- Keys, bosun_util:trim(K) =/= <<>>],
            Normalized =:= [] orelse lists:member(Key, Normalized);
        _ -> true
    end.
