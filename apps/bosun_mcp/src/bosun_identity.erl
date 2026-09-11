%%%-------------------------------------------------------------------
%%% @doc MCP 会话身份。
%%%
%%% beamai_mcp 每个会话一个 `beamai_mcp_server' 进程，tool handler 就在该进程里
%%% 执行，所以 `self()' 就是会话标识。身份存在 ETS（`session pid → identity'），
%%% 由本 gen_server 持有并 monitor 会话进程，会话退出即清。
%%%
%%% 身份来源：`identify' 工具显式设置 > 自动名 `agent-<会话短id>'（首次用到时生成并
%%% 记住，同一会话内稳定）。不强制 identify——自动名已经保证多个 worktree 互不混淆，
%%% 只是可读性差，workflow 文档催 Agent 一开始就 identify。
%%%-------------------------------------------------------------------
-module(bosun_identity).
-behaviour(gen_server).

-export([start_link/0, identify/1, current/0, current/1, lookup/1, to_map/1]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2]).

-define(TAB, bosun_identity).

-type identity() :: #{name := binary(), kind := human | agent,
                      project => binary() | undefined, worktree => binary() | undefined,
                      explicit := boolean()}.
-export_type([identity/0]).

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

%% @doc 显式设置当前会话（调用进程）的身份；同时登记进 actor 表。
-spec identify(map()) -> {ok, identity()} | {error, term()}.
identify(Args) ->
    case bosun_util:get_bin(<<"name">>, Args, <<>>) of
        <<>> -> {error, {invalid, name, <<"must not be empty">>}};
        Name ->
            Kind = case bosun_actor:parse_kind(maps:get(<<"kind">>, Args, <<"agent">>)) of
                       undefined -> agent;
                       K -> K
                   end,
            Project = case bosun_util:get_opt_bin(<<"project">>, Args) of
                          undefined -> undefined;
                          <<>> -> undefined;
                          P -> bosun_id:normalize_key(P)
                      end,
            Worktree = case bosun_util:get_opt_bin(<<"worktree">>, Args) of
                           <<>> -> undefined;
                           W -> W
                       end,
            Id = #{name => Name, kind => Kind, project => Project, worktree => Worktree, explicit => true},
            ok = gen_server:call(?MODULE, {set, self(), Id}),
            ok = bosun_actor:touch(Name, Kind, #{project => Project, worktree => Worktree}),
            {ok, Id}
    end.

%% @doc 当前会话身份；没有显式身份时生成并记住一个自动名。
-spec current() -> identity().
current() -> current(self()).

-spec current(pid()) -> identity().
current(Pid) ->
    case lookup(Pid) of
        {ok, Id} -> Id;
        error ->
            Id = #{name => auto_name(Pid), kind => agent, project => undefined, worktree => undefined,
                   explicit => false},
            %% 表可能还没起来（纯领域测试直接调 handler）：那就每次现算，名字仍然稳定
            catch gen_server:call(?MODULE, {set, Pid, Id}),
            Id
    end.

-spec lookup(pid()) -> {ok, identity()} | error.
lookup(Pid) ->
    try ets:lookup(?TAB, Pid) of
        [{_, Id}] -> {ok, Id};
        [] -> error
    catch
        error:badarg -> error
    end.

%% 由 pid 派生的稳定短名：同一会话内不变，不同会话几乎不会撞
auto_name(Pid) ->
    Hash = erlang:phash2(Pid, 16#FFFFFF),
    <<"agent-", (list_to_binary(io_lib:format("~6.16.0b", [Hash])))/binary>>.

-spec to_map(identity()) -> map().
to_map(#{name := N, kind := K, explicit := E} = Id) ->
    #{<<"name">> => N, <<"kind">> => atom_to_binary(K, utf8),
      <<"project">> => maps:get(project, Id, undefined),
      <<"worktree">> => maps:get(worktree, Id, undefined),
      <<"identified">> => E}.

%%====================================================================

init([]) ->
    ?TAB = ets:new(?TAB, [named_table, set, protected, {read_concurrency, true}]),
    {ok, #{}}.

handle_call({set, Pid, Id}, _From, Monitors) ->
    ets:insert(?TAB, {Pid, Id}),
    Monitors1 = case maps:is_key(Pid, Monitors) of
                    true -> Monitors;
                    false -> Monitors#{Pid => erlang:monitor(process, Pid)}
                end,
    {reply, ok, Monitors1};
handle_call(_, _From, St) ->
    {reply, {error, unknown_call}, St}.

handle_cast(_, St) -> {noreply, St}.

handle_info({'DOWN', _Ref, process, Pid, _}, Monitors) ->
    ets:delete(?TAB, Pid),
    {noreply, maps:remove(Pid, Monitors)};
handle_info(_, St) -> {noreply, St}.
