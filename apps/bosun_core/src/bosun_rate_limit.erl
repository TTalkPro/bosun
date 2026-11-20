%%%-------------------------------------------------------------------
%%% @doc 固定窗口计数的限流器（ETS）。调用方自己定「桶」「key」「上限」「窗口」：
%%%
%%%   hit(login_fail, {Ip, Email}, 10, 15 * 60 * 1000)   记一次；窗口内已满 → 拒绝
%%%   check(...)                                         只看不记
%%%   reset(Bucket, Key)                                 清零（比如登录成功）
%%%
%%% 窗口从第一次命中算起，到期整条作废。这是节流用的，不是计费：并发下可能多放一两次，
%%% 节点重启全部清零，都无所谓。表由本 gen_server 持有并每分钟清一次过期项；
%%% 进程没起来（纯领域测试）时一律放行。
%%%-------------------------------------------------------------------
-module(bosun_rate_limit).
-behaviour(gen_server).

-export([start_link/0, hit/4, check/4, reset/2, reset_all/0]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2]).

-define(TAB, bosun_rate_limit).
-define(SWEEP_MS, 60 * 1000).

-type verdict() :: ok | {error, {too_many_requests, pos_integer()}}.

start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

%% @doc 记一次。窗口内已经有 Limit 次了 → `{error, {too_many_requests, 还要等几秒}}'，本次不计。
-spec hit(atom(), term(), pos_integer(), pos_integer()) -> verdict().
hit(Bucket, Key, Limit, WindowMs) ->
    Id = {Bucket, Key},
    Now = erlang:monotonic_time(millisecond),
    try ets:lookup(?TAB, Id) of
        [{_, Count, Until}] when Until > Now, Count >= Limit ->
            too_many(Until - Now);
        [{_, _, Until}] when Until > Now ->
            _ = ets:update_counter(?TAB, Id, {2, 1}),
            ok;
        _ ->
            true = ets:insert(?TAB, {Id, 1, Now + WindowMs}),
            ok
    catch
        error:badarg -> ok
    end.

%% @doc 只看不记：现在再来一次会不会被拒。
-spec check(atom(), term(), pos_integer(), pos_integer()) -> verdict().
check(Bucket, Key, Limit, _WindowMs) ->
    Now = erlang:monotonic_time(millisecond),
    try ets:lookup(?TAB, {Bucket, Key}) of
        [{_, Count, Until}] when Until > Now, Count >= Limit -> too_many(Until - Now);
        _ -> ok
    catch
        error:badarg -> ok
    end.

-spec reset(atom(), term()) -> ok.
reset(Bucket, Key) ->
    try ets:delete(?TAB, {Bucket, Key}) of
        _ -> ok
    catch
        error:badarg -> ok
    end.

%% @doc 测试用：全部清零。
-spec reset_all() -> ok.
reset_all() ->
    try ets:delete_all_objects(?TAB) of
        _ -> ok
    catch
        error:badarg -> ok
    end.

%% 向上取整到秒，至少 1
too_many(LeftMs) -> {error, {too_many_requests, max(1, (LeftMs + 999) div 1000)}}.

%%====================================================================

init([]) ->
    ?TAB = ets:new(?TAB, [named_table, set, public, {write_concurrency, true}, {read_concurrency, true}]),
    erlang:send_after(?SWEEP_MS, self(), sweep),
    {ok, #{}}.

handle_call(_, _From, St) -> {reply, {error, unknown_call}, St}.

handle_cast(_, St) -> {noreply, St}.

handle_info(sweep, St) ->
    Now = erlang:monotonic_time(millisecond),
    _ = ets:select_delete(?TAB, [{{'_', '_', '$1'}, [{'=<', '$1', Now}], [true]}]),
    erlang:send_after(?SWEEP_MS, self(), sweep),
    {noreply, St};
handle_info(_, St) -> {noreply, St}.
