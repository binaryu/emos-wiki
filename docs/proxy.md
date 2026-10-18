---
title: 反代搭建与使用
sidebar_label: 反代相关
sidebar_position: 8
slug: /proxy
---

# 🛰️ 反代

**反代（反向代理）** 用一台机器（别人的服务器，或者 Cloudflare Worker）替你去请求 emos。对使用者来说它只是多一条线路，对搭建者来说服内是**欢迎反代**的，~~后续也许还能赚点萝卜~~。

官方页面：[wiki.emos.best/proxy.html](https://wiki.emos.best/proxy.html)

:::tip
反代只是**换一条路**，不改变服务器本身的速度上限。如果你的网络到 emos 源站本来就很好，直连就可以。
:::

---

## 搭建要求

| 项目 | 要求 |
| --- | --- |
| 视频服上游 | `https://video.emos.best`，建议对外路径 `/emby` |
| 请求头 `EMOS-PROXY-ID` | 必填，你的用户 ID，形如 `eABCDEFGHs` |
| 请求头 `EMOS-PROXY-NAME` | 必填，你的自定义称号，形如 `@xxx的反代`（会显示在客户端里） |
| 请求头 `X-FORWARDED-FOR` | 必填，必须把用户真实 IP 传给上游 |
| `206` 状态码 | 必须支持，也就是正确透传 `Range` 请求头 |

**建议**（做了体验明显更好）：

- 缓存 `/emby/Items/*/Images/*` 图片
- 缓存 `/emby/System/Ping`
- 对 `/emby/Sessions/Playing/Progress` 做节流，否则播放进度上报会占掉大量请求

:::tip[分流域名也要代理]
播放直链可能来自 `*.sharepoint.cn`、`*.sharepoint.com`、`*.emosstore.cfd`、`*.eeew.eu.org`。如果只代理了 `/emby` 接口而没代理这些域名，表现就是「能进库、点播放转圈」。
:::

---

## 自己搭一个

有 VPS 用 **Meridian**，只有 Cloudflare 域名用 **CF-EMBY-PROXY-UI**。两者要做的事一样：路径 `/emby`、两枚 EMOS 头、保住真实 IP、支持 206。只想弄懂原理就展开最后三个手写配置。

<details>
<summary><b>VPS：Meridian（推荐）</b></summary>

Go 写的多站点 Emby 反代面板，自动 TLS、多线路故障切换，全在网页上点。

```bash
mkdir -p ~/meridian/data
docker run -d --name meridian --restart unless-stopped --network host \
  -v ~/meridian/data:/app/data -e PORT=9090 -e DB_PATH=/app/data/meridian.db \
  ghcr.io/chanhui800/meridian:latest
```

不想用 Docker：`curl -fsSL https://github.com/chanhui800/Meridian/releases/latest/download/install.sh | sudo bash`

首次启动日志里会打印初始化令牌，打开 `http://服务器IP:9090` 初始化，建站点后只填三处：

| 面板项 | 填什么 |
| --- | --- |
| 入口方式 | 路径前缀 `/emby` |
| 上游请求头 | `EMOS-PROXY-ID` = 你的 ID，`EMOS-PROXY-NAME` = 你的称号 |
| 客户端 IP 透传 | 保持默认（X-Real-IP + X-Forwarded-For） |

客户端地址填 `https://域名:9090/emby`，HTTPS 在「全局设置 → TLS 设置」里配 ACME。

[github.com/chanhui800/Meridian](https://github.com/chanhui800/Meridian)

</details>

<details>
<summary><b>Worker：CF-EMBY-PROXY-UI（推荐）</b></summary>

跑在 Cloudflare Worker 上的多节点代理，单文件 `worker.js` + `/admin` 后台。

1. 建一个 KV 和一个 D1，绑定为 `ENI_KV` / `DB`；加两个 Secret：`ADMIN_PASS`、`JWT_SECRET`
2. 粘贴 `worker.js` 部署（`ADMIN_PATH` 默认 `/admin`，改掉更安全）
3. 后台加节点：地址 `http://源站:8096`，「自定义请求头」里填两枚 `EMOS-*` 头

`X-Forwarded-For` 默认注入，节点里写同名头也覆盖不掉。免费版请求数偏紧，能直连的节点选「直连」省额度。

[github.com/axuitomo/CF-EMBY-PROXY-UI](https://github.com/axuitomo/CF-EMBY-PROXY-UI) · [项目文档](https://wiki.8081666.xyz)

</details>

<details>
<summary><b>手写：Nginx</b></summary>

```nginx
location /emby/ {
    proxy_pass https://video.emos.best;
    proxy_http_version 1.1;

    proxy_ssl_server_name on;
    proxy_ssl_name video.emos.best;

    proxy_set_header Host              video.emos.best;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header EMOS-PROXY-ID     "eABCDEFGHs";
    proxy_set_header EMOS-PROXY-NAME   "@你的称号";

    # 视频流关键：关掉缓冲
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_max_temp_file_size 0;
    proxy_read_timeout 3600s;
}
```

`Host` 要改成上游域名，否则可能 400/403；证书用 certbot / acme.sh 签。

</details>

<details>
<summary><b>手写：Caddy</b></summary>

```caddyfile
proxy.example.com {
    reverse_proxy /emby/* video.emos.best {
        header_up Host            video.emos.best
        header_up EMOS-PROXY-ID   eABCDEFGHs
        header_up EMOS-PROXY-NAME "@你的称号"
    }
}
```

证书、`Range`、`X-Forwarded-For` 都是自动的。

</details>

<details>
<summary><b>手写：Cloudflare Worker</b></summary>

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('EMOS-PROXY-ID', 'eABCDEFGHs');
    headers.set('EMOS-PROXY-NAME', '@你的称号');
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');

    const res = await fetch('https://video.emos.best' + url.pathname + url.search, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
    // 原样转发，保留 206 / content-range
    return new Response(res.body, { status: res.status, headers: res.headers });
  },
};
```

只适合轻量用：免费版请求数吃紧，正经跑还是用上面两个项目。

</details>

---

## 搭完先自测

### 1. 请求头有没有传对

访问 `<你的地址>/emby/system/ext/proxy/test`，例如 `https://proxy.example.com/emby/system/ext/proxy/test`：

```json5
{
  // 只有为 true 时，才会按使用次数给你累加萝卜
  "is_bind": false,
  "proxy_id": null,
  // 这里应该显示你的称号，客户端里也会看到
  "proxy_name": null,
  // 用户真实 IP，一直不对就去群里反馈
  "ip": "127.0.0.1",
  "ua": "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
}
```

`proxy_id` / `proxy_name` 还是 `null`，说明头没生效（拼写、大小写、被 `add_header` 挡住了、或者反代到了错误的路径）。

### 2. 支不支持 206

```bash
curl -i -L -H "Range: bytes=0-1" "https://proxy.example.com/emby/System/Ext/Proxy/TestVideo"
```

正常输出：

```text
HTTP/2 206
content-range: bytes 0-1/84890474
```

如果是 `200` + 整段返回，说明某处缓冲/改写了响应，播放器会拖不动进度条。

### 3. 播放后看请求数

随便播一部片，然后用 bot 查询自己的请求数。**请求数暴涨**基本等于反代在漏请求（图片没缓存、Progress 没节流、或者客户端在反复重试）。

### 4. 测速文件

```text
https://files.emosstore.cfd/files/speedtest/johann-mouse.mp4
https://files.emosstore.cfd/files/speedtest/100mb.bin
```
拿这两个文件对比「直连 / 你的反代」的下行速度，比凭感觉可靠。
也可以内置到你的反代里面,用来测直观的测速。

---

## 在客户端里用反代

1. 拿到反代地址（自带 `/emby` 路径的直接用，不要自己再补一层）。
2. Emby 客户端 → 添加服务器 → 填域名、端口、账号密码。
3. 播放器里可以存多个服务器地址，卡了就在设置里切一个。

服务端已支持 `emby_ext_domains`：在支持的播放器里可以直接随时切换地址，不用重新登录。

---

## 现成的反代地址

官方页面里维护了一份动态列表（名称 / 备注 / 地址 / 添加时间），并且一直在更新：

👉 [wiki.emos.best/proxy.html](https://wiki.emos.best/proxy.html)

挑选思路：

- 优先选**和你同运营商**的（电信选「电信优选」、移动选「移动快乐路」这类）。
- 备注里写了「不定时更新」「看脸」的，属于自用机，随时可能挂，当备份线路即可。
- 标注了特殊端口的（例如 `:44443`）记得把端口一起填进客户端。
- 先用上面的测速文件和自己的常用时段试一下，别看名字挑。

---

## 常见问题

| 现象 | 大概率原因 |
| --- | --- |
| 测试接口 404 / 404 Not Found | 路径不是 `/emby`，或反代只配了根路径没配子路径 |
| `proxy_id` 为 null | `EMOS-PROXY-ID` 拼错 / 没加 / 被上游当成非法头丢弃 |
| 能进库但播放转圈 | 分流域名没代理，或没关 `proxy_buffering` |
| 拖进度条失败、从头播 | 响应被改成 200，或中间层吞了 `Range` |
| 图片全裂 | 图片路径没走反代（检查 `/emby/Items/*/Images/*` 是否命中） |
| 播放很卡但测速正常 | Progress 上报把请求数打满，或上游到你的回源线路差 |
| 客户端提示服务器不存在 | 端口 / HTTPS 证书问题，先浏览器打开测试接口验证 |

