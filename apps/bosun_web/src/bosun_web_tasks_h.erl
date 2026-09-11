%%%-------------------------------------------------------------------
%%% @doc /api/v1/projects/:key/tasks · /api/v1/tasks/:id · /api/v1/tasks/:id/transition
%%%      /api/v1/tasks/:id/links · /api/v1/tasks/:id/links/:type/:to
%%%-------------------------------------------------------------------
-module(bosun_web_tasks_h).

-export([init/2]).

-import(bosun_web_api, [reply_result/3, with_body/2, query_map/1, method_not_allowed/2]).

init(Req0, #{mode := Mode} = State) ->
    Method = cowboy_req:method(Req0),
    Req = handle(Mode, Method, Req0),
    {ok, Req, State}.

handle(project_tasks, <<"GET">>, Req) ->
    Key = cowboy_req:binding(key, Req),
    reply_result(200, bosun_task:list(Key, query_map(Req)), Req);
handle(project_tasks, <<"POST">>, Req) ->
    Key = cowboy_req:binding(key, Req),
    with_body(Req, fun(Body, Req1) ->
        Input = Body#{<<"actor_kind">> => maps:get(<<"actor_kind">>, Body, <<"human">>)},
        reply_result(201, bosun_task:create(Key, Input), Req1)
    end);
handle(project_tasks, _, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);

handle(task, <<"GET">>, Req) ->
    reply_result(200, bosun_task:get(cowboy_req:binding(id, Req)), Req);
handle(task, <<"PATCH">>, Req) ->
    Id = cowboy_req:binding(id, Req),
    with_body(Req, fun(Body, Req1) -> reply_result(200, bosun_task:update(Id, Body), Req1) end);
handle(task, _, Req) ->
    method_not_allowed(Req, <<"GET, PATCH">>);

handle(transition, <<"POST">>, Req) ->
    Id = cowboy_req:binding(id, Req),
    with_body(Req, fun(Body, Req1) ->
        Opts = #{actor => maps:get(<<"actor">>, Body, <<"user">>),
                 actor_kind => maps:get(<<"actor_kind">>, Body, <<"human">>),
                 comment => maps:get(<<"comment">>, Body, undefined),
                 commits => maps:get(<<"commits">>, Body, []),
                 tests => maps:get(<<"tests">>, Body, undefined)},
        reply_result(200, bosun_task_status:transition(Id, maps:get(<<"to">>, Body, <<>>), Opts), Req1)
    end);
handle(transition, _, Req) ->
    method_not_allowed(Req, <<"POST">>);

%% 关联：POST {to, type, actor} 建链 → 201 本任务详情；DELETE /links/:type/:to → 200 本任务详情
handle(links, <<"POST">>, Req) ->
    Id = cowboy_req:binding(id, Req),
    with_body(Req, fun(Body, Req1) ->
        Opts = #{actor => maps:get(<<"actor">>, Body, <<"user">>),
                 actor_kind => maps:get(<<"actor_kind">>, Body, <<"human">>)},
        reply_result(201, bosun_link:add(Id, maps:get(<<"to">>, Body, <<>>), maps:get(<<"type">>, Body, <<>>), Opts), Req1)
    end);
handle(links, _, Req) ->
    method_not_allowed(Req, <<"POST">>);
handle(link, <<"DELETE">>, Req) ->
    reply_result(200, bosun_link:remove(cowboy_req:binding(id, Req), cowboy_req:binding(to, Req), cowboy_req:binding(type, Req)), Req);
handle(link, _, Req) ->
    method_not_allowed(Req, <<"DELETE">>).
