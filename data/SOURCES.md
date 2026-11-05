# 中文名称数据来源

缓存日期：2026-10-12。

头目资料 `alpha-catalog.json` 于2026-11-05重新从上述公开源站接口获取并验证，共310个精灵/地区/地点组合。其余中文词表仍使用之前缓存，未知译名保留原文。

位置图片于2026-11-05取得：`alpha-catalog.json` 中的 `Map Link` 为唯一关联依据。38张原图对应45个地点组合，保存在 `web/maps/`，来源URL、SHA256、字节数和下载日期记录于 `map-manifest.json`。原图保留原作者的路线箭头和英文标注，不自动重绘或推断新位置。图片版权归原作者，项目不将第三方图片纳入源码MIT授权。

原图提供方：Alphapedia；图床为其资料中链接的 i.imgur.com。没有源图的265个组合明确显示“源站暂无此地点图片”，不借用其他地点图片。

- pokemon-zh.json：https://alpha.pokemmotools.org/static/translations/zh/pokemon-species-zh.json
- region-zh.json：https://alpha.pokemmotools.org/static/translations/zh/region-zh.json
- location-zh.json：https://alpha.pokemmotools.org/static/translations/zh/locationPokeapi-zh.json
- ability-zh.json：https://alpha.pokemmotools.org/static/translations/zh/ability-zh.json
- move-zh.json：https://alpha.pokemmotools.org/static/translations/zh/move-zh.json
- egg-group-zh.json：https://alpha.pokemmotools.org/static/translations/zh/egg-group-zh.json
- notes-zh.json：取自 https://alpha.pokemmotools.org/static/translations/zh/extra-zh.json 的 notes 字典
- alpha-catalog.json：https://alpha.pokemmotools.org/api/alpha-spawn-data
- pokemon-natdex.json：https://alpha.pokemmotools.org/api/pokemon-natdex-map

上述文件用于宝可梦、地区和地点名称翻译，来源为 Alphapedia 的公开简体中文词表；未知名称保留英文。没有猜译缺失条目。可在持久化数据目录添加 translations.json，以 pokemon、region、location 三个对象提供经用户核实的覆盖翻译。
