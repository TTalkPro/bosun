%%%-------------------------------------------------------------------
%%% @doc 协作工作流文档。来源是仓库 docs/AGENT-WORKFLOW*.md，rebar pre_hook 拷进
%%% priv/workflow；这里只负责按语言读出来，MCP 资源与 REST 共用。
%%%-------------------------------------------------------------------
-module(bosun_workflow).

-export([doc/0, doc/1, path/1]).

-type lang() :: zh | en.

-spec doc() -> {ok, binary()} | {error, term()}.
doc() -> doc(zh).

-spec doc(lang() | binary()) -> {ok, binary()} | {error, term()}.
doc(<<"en">>) -> doc(en);
doc(<<"zh">>) -> doc(zh);
doc(Bin) when is_binary(Bin) -> {error, {invalid, lang, Bin}};
doc(Lang) ->
    case file:read_file(path(Lang)) of
        {ok, Bin} -> {ok, Bin};
        {error, Reason} -> {error, {workflow_doc, Lang, Reason}}
    end.

-spec path(lang()) -> file:filename().
path(zh) -> filename:join([code:priv_dir(bosun_core), "workflow", "AGENT-WORKFLOW.md"]);
path(en) -> filename:join([code:priv_dir(bosun_core), "workflow", "AGENT-WORKFLOW.en.md"]).
