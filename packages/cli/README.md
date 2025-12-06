# rn-inspector (browser)

Single command starts everything: proxy + UI (served in browser) + Metro attach.

## Install

```bash
npm i -g rn-inspector
```

## Run

```bash
rn-inspector --port 8081          # Metro port (default 8081)
# optional:
# --ui-port <http_port>   (default 4173, static UI server)
# --ui-ws-port <ws_port>  (default 9230, UI websocket to proxy)
```

What it does:
- Connects to Metro websocket at `ws://127.0.0.1:<port>/message`
- Starts proxy UI websocket at `ws://127.0.0.1:<ui-ws-port>/inspector`
- Serves built UI at `http://127.0.0.1:<ui-port>` and opens in your browser
