%%%-------------------------------------------------------------------
%%% @doc Milestone（14）：
%%%   /api/v1/projects/:key/milestones          GET 列表 · POST 新建
%%%   /api/v1/milestones/:id                    GET（含范围变更）· PATCH · DELETE
%%%   /api/v1/milestones/:id/:action            POST activate | pause | reopen | release
%%%   /api/v1/projects/:key/tasks/milestone     POST {ids, milestone, comment?} 批量设置归属（"" = 移出）
%%%-------------------------------------------------------------------
-module(bosun_web_milestones_h).

-export([init/2]).

-import(bosun_web_api, [reply/3, reply_result/3, reply_error/2, with_body/2, method_not_allowed/2]).

init(Req0, #{mode := Mode} = State) ->
    Req = handle(Mode, cowboy_req:method(Req0), Req0),
    {ok, Req, State}.

handle(project_milestones, <<"GET">>, Req) ->
    case bosun_milestone:list(cowboy_req:binding(key, Req)) of
        {ok, Ms} -> reply(200, #{<<"milestones">> => Ms}, Req);
        {error, R} -> reply_error(Req, R)
    end;
handle(project_milestones, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        reply_result(201, bosun_milestone:create(cowboy_req:binding(key, Req1), with_actor(Body, Req1)), Req1)
    end);
handle(project_milestones, _, Req) ->
    method_not_allowed(Req, <<"GET, POST">>);

handle(milestone, <<"GET">>, Req) ->
    reply_result(200, bosun_milestone:get(cowboy_req:binding(id, Req)), Req);
handle(milestone, <<"PATCH">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        reply_result(200, bosun_milestone:update(cowboy_req:binding(id, Req1), Body), Req1)
    end);
handle(milestone, <<"DELETE">>, Req) ->
    Id = cowboy_req:binding(id, Req),
    case bosun_milestone:delete(Id) of
        ok -> reply(200, #{<<"deleted">> => string:uppercase(Id)}, Req);
        {error, R} -> reply_error(Req, R)
    end;
handle(milestone, _, Req) ->
    method_not_allowed(Req, <<"GET, PATCH, DELETE">>);

handle(milestone_action, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        Id = cowboy_req:binding(id, Req1),
        Opts = with_actor(Body, Req1),
        Res = case cowboy_req:binding(action, Req1) of
                  <<"activate">> -> bosun_milestone:activate(Id, Opts);
                  <<"pause">> -> bosun_milestone:pause(Id, Opts);
                  <<"reopen">> -> bosun_milestone:reopen(Id, Opts);
                  <<"release">> -> bosun_milestone:release(Id, Opts);
                  _ -> {error, not_found}
              end,
        reply_result(200, Res, Req1)
    end);
handle(milestone_action, _, Req) ->
    method_not_allowed(Req, <<"POST">>);

handle(tasks_milestone, <<"POST">>, Req) ->
    with_body(Req, fun(Body, Req1) ->
        #{<<"actor">> := Actor} = with_actor(#{}, Req1),
        Res = bosun_milestone:assign(cowboy_req:binding(key, Req1), maps:get(<<"ids">>, Body, undefined),
                                     maps:get(<<"milestone">>, Body, <<>>), Actor,
                                     case maps:get(<<"comment">>, Body, undefined) of C when is_binary(C) -> C; _ -> undefined end),
        reply_result(200, Res, Req1)
    end);
handle(tasks_milestone, _, Req) ->
    method_not_allowed(Req, <<"POST">>).

%% 署名 = 登录用户 / key 主人（不收 body 里的 actor）
with_actor(Body, Req) ->
    #{actor := Actor} = bosun_web_auth:actor_fields(Req),
    Body#{<<"actor">> => Actor}.
