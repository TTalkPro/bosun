%%%-------------------------------------------------------------------
%%% @doc cowboy 路由表。
%%%-------------------------------------------------------------------
-module(bosun_web_router).

-export([dispatch/0]).

dispatch() ->
    StaticDir = static_dir(),
    cowboy_router:compile([
        {'_', [
            {"/api/v1/projects",                 bosun_web_projects_h, #{}},
            {"/api/v1/projects/:key",            bosun_web_projects_h, #{}},
            {"/api/v1/projects/:key/tasks",      bosun_web_tasks_h,    #{mode => project_tasks}},
            {"/api/v1/tasks/:id",                bosun_web_tasks_h,    #{mode => task}},
            {"/api/v1/tasks/:id/transition",     bosun_web_tasks_h,    #{mode => transition}},
            {"/api/v1/tasks/:id/links",          bosun_web_tasks_h,    #{mode => links}},
            {"/api/v1/tasks/:id/links/:type/:to", bosun_web_tasks_h,   #{mode => link}},
            {"/api/v1/tasks/:id/feedback",       bosun_web_feedback_h, #{}},
            {"/api/v1/tasks/:id/feedback/:seq",  bosun_web_feedback_h, #{}},
            {"/api/v1/search",                   bosun_web_search_h,   #{}},
            {"/api/v1/actors",                   bosun_web_actors_h,   #{}},
            {"/api/v1/workflow.md",              bosun_web_workflow_h, #{}},
            {"/api/v1/query",                    bosun_web_query_h,    #{mode => query}},
            {"/api/v1/filters",                  bosun_web_query_h,    #{mode => filters}},
            {"/api/v1/filters/:id",              bosun_web_query_h,    #{mode => filter}},
            {"/api/v1/filters/:id/run",          bosun_web_query_h,    #{mode => run}},
            {"/api/v1/export",                   bosun_web_backup_h,   #{mode => export}},
            {"/api/v1/import",                   bosun_web_backup_h,   #{mode => import}},
            {"/api/[...]",                       bosun_web_api,        not_found},
            {"/mcp",                             beamai_mcp_cowboy_handler, bosun_mcp:cowboy_config()},
            {"/[...]",                           bosun_web_static_h,   #{dir => StaticDir}}
        ]}
    ]).

%% 缺省用 bosun_web 自己的 priv/static（`pnpm build' 的输出目录），开发与 release
%% 里都能解析；配置成绝对路径则原样使用。
static_dir() ->
    case application:get_env(bosun_web, static_dir, priv) of
        priv -> filename:join(code:priv_dir(bosun_web), "static");
        Dir when is_list(Dir) -> Dir;
        Dir when is_binary(Dir) -> binary_to_list(Dir)
    end.
