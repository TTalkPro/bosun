%%%-------------------------------------------------------------------
%%% @doc 静态文件 + SPA 回退：文件存在就发文件，否则发 index.html
%%% （前端用 history 路由，/tasks/BOS-1 这种路径也要落到页面）。
%%%-------------------------------------------------------------------
-module(bosun_web_static_h).

-export([init/2]).

init(Req0, #{dir := Dir} = State) ->
    Req = case cowboy_req:method(Req0) of
              <<"GET">> -> serve(Req0, Dir);
              <<"HEAD">> -> serve(Req0, Dir);
              _ -> cowboy_req:reply(405, #{<<"allow">> => <<"GET, HEAD">>}, <<>>, Req0)
          end,
    {ok, Req, State}.

serve(Req, Dir) ->
    Path = cowboy_req:path(Req),
    case safe_path(Dir, Path) of
        {ok, File} ->
            case filelib:is_regular(File) of
                true -> send_file(Req, File);
                false -> send_index(Req, Dir)
            end;
        error ->
            send_index(Req, Dir)
    end.

%% 拒绝 `..' 与绝对路径拼接逃逸
safe_path(Dir, Path) ->
    Segments = [S || S <- binary:split(Path, <<"/">>, [global]), S =/= <<>>],
    case lists:any(fun(S) -> S =:= <<"..">> end, Segments) of
        true -> error;
        false ->
            Rel = case Segments of
                      [] -> "index.html";
                      _ -> filename:join([binary_to_list(S) || S <- Segments])
                  end,
            {ok, filename:join(Dir, Rel)}
    end.

send_index(Req, Dir) ->
    Index = filename:join(Dir, "index.html"),
    case filelib:is_regular(Index) of
        true -> send_file(Req, Index);
        false ->
            cowboy_req:reply(404, #{<<"content-type">> => <<"text/plain; charset=utf-8">>},
                             <<"frontend not built: run `cd web && pnpm build`\n">>, Req)
    end.

send_file(Req, File) ->
    Size = filelib:file_size(File),
    {Type, SubType, _} = cow_mimetypes:web(list_to_binary(File)),
    Headers = #{<<"content-type">> => <<Type/binary, "/", SubType/binary>>,
                <<"cache-control">> => cache_control(File)},
    cowboy_req:reply(200, Headers, {sendfile, 0, Size, File}, Req).

%% Vite 产物带 hash 的 assets 可长期缓存；index.html 不缓存
cache_control(File) ->
    case string:find(File, "/assets/") of
        nomatch -> <<"no-cache">>;
        _ -> <<"public, max-age=31536000, immutable">>
    end.
