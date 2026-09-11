-module(bosun_test_env).
-export([setup/0]).

%% 测试环境：ram_copies 表 + 临时目录里的搜索索引（进程只起一次，每次 setup 清空）
setup() ->
    ok = bosun_store:reset_tables(),
    case whereis(bosun_search) of
        undefined ->
            Dir = filename:join(["/tmp", "bosun_test_search_" ++ integer_to_list(erlang:system_time(millisecond))]),
            {ok, Pid} = bosun_search:start_link(Dir),
            unlink(Pid);
        _ -> ok
    end,
    ok = bosun_search:reset(),
    case whereis(bosun_identity) of
        undefined -> {ok, IdPid} = bosun_identity:start_link(), unlink(IdPid);
        _ -> ok
    end,
    ok.
