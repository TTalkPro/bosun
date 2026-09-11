%%%-------------------------------------------------------------------
%%% @doc 操作者登记：每个写操作把 actor 名字 upsert 进 `actor' 表，
%%% 记录它是人还是 Agent、属于哪个项目 / worktree、首次与最近出现时间。
%%%
%%% 这不是认证——名字仍是自报的；它只是让 UI 与查询能区分人和 Agent。
%%%-------------------------------------------------------------------
-module(bosun_actor).

-include("bosun.hrl").

-export([touch/2, touch/3, get/1, list/0, kind_of/1, parse_kind/1, to_map/1, backfill/0]).

-type kind() :: human | agent.

%% @doc upsert。Kind 为 undefined 时：已有记录保持不变，新记录按名字猜（`user` → human，其余 agent）。
-spec touch(term(), kind() | undefined) -> ok.
touch(Name, Kind) -> touch(Name, Kind, #{}).

-spec touch(term(), kind() | undefined, map()) -> ok.
touch(Name0, Kind, Extra) ->
    case bosun_util:trim(Name0) of
        <<>> -> ok;
        Name ->
            Now = bosun_util:now_ms(),
            Project = case bosun_util:get_opt_bin(project, Extra) of
                          undefined -> undefined;
                          <<>> -> undefined;
                          P -> bosun_id:normalize_key(P)
                      end,
            Worktree = case bosun_util:get_opt_bin(worktree, Extra) of
                           <<>> -> undefined;
                           W -> W
                       end,
            Rec = case mnesia:dirty_read(actor, Name) of
                      [] ->
                          #actor{name = Name, kind = default_kind(Name, Kind), project = Project,
                                 worktree = Worktree, first_seen = Now, last_seen = Now};
                      [A] ->
                          A#actor{kind = case Kind of undefined -> A#actor.kind; K -> K end,
                                  project = case Project of undefined -> A#actor.project; P2 -> P2 end,
                                  worktree = case Worktree of undefined -> A#actor.worktree; W2 -> W2 end,
                                  last_seen = Now}
                  end,
            ok = mnesia:dirty_write(Rec)
    end.

default_kind(_, human) -> human;
default_kind(_, agent) -> agent;
default_kind(<<"user">>, undefined) -> human;
default_kind(_, undefined) -> agent.

-spec get(term()) -> {ok, map()} | {error, not_found}.
get(Name) ->
    case mnesia:dirty_read(actor, bosun_util:trim(Name)) of
        [A] -> {ok, to_map(A)};
        [] -> {error, not_found}
    end.

%% @doc 按最近出现时间倒序。
-spec list() -> {ok, [map()]}.
list() ->
    All = mnesia:dirty_select(actor, [{'_', [], ['$_']}]),
    {ok, [to_map(A) || A <- lists:sort(fun(A, B) -> A#actor.last_seen >= B#actor.last_seen end, All)]}.

%% @doc 未登记的名字按缺省规则猜。
-spec kind_of(binary() | undefined) -> kind() | undefined.
kind_of(undefined) -> undefined;
kind_of(Name) ->
    case mnesia:dirty_read(actor, Name) of
        [#actor{kind = K}] -> K;
        [] -> default_kind(Name, undefined)
    end.

-spec parse_kind(term()) -> kind() | undefined.
parse_kind(human) -> human;
parse_kind(agent) -> agent;
parse_kind(<<"human">>) -> human;
parse_kind(<<"user">>) -> human;
parse_kind(<<"agent">>) -> agent;
parse_kind(_) -> undefined.

-spec to_map(#actor{}) -> map().
to_map(#actor{} = A) ->
    #{<<"name">> => A#actor.name,
      <<"kind">> => atom_to_binary(A#actor.kind, utf8),
      <<"project">> => A#actor.project,
      <<"worktree">> => A#actor.worktree,
      <<"first_seen">> => bosun_json:iso8601(A#actor.first_seen),
      <<"last_seen">> => bosun_json:iso8601(A#actor.last_seen)}.

%% @doc 从历史与 feedback 里把没登记过的名字补进来（启动时跑一次；幂等，只补缺的）。
-spec backfill() -> non_neg_integer().
backfill() ->
    Tasks = mnesia:dirty_select(task, [{'_', [], ['$_']}]),
    Fbs = mnesia:dirty_select(feedback, [{'_', [], ['$_']}]),
    Names = lists:usort([maps:get(actor, H) || T <- Tasks, H <- T#task.history]
                        ++ [F#feedback.author || F <- Fbs]),
    Missing = [N || N <- Names, is_binary(N), mnesia:dirty_read(actor, N) =:= []],
    lists:foreach(fun(N) -> touch(N, undefined) end, Missing),
    length(Missing).
