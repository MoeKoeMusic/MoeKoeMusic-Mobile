# MoeKoe

MoeKoe 的 Expo 移动端项目，应用内直接运行 KuGou API 适配层，不依赖外部手填 API 地址。

## Development

```bash
npm install
npm --prefix api install
npm run generate:mobile-api
npx expo start
```

## Build Notes

- 应用名：`MoeKoe`
- Android 包名：`cn.moekoe.music`
- iOS Bundle Identifier：`cn.moekoe.music`
- 当前应用版本：`1.6.7`

## Structure

- `api/`：KuGou API 子仓库
- `src/lib/kugou-api/`：移动端运行时适配层
- `src/app/(tabs)/`：首页、播放页、我的
