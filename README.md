# 📊 股票看板

A股持仓跟踪看板 — 实时行情 · MACD · KDJ · 风险与机遇智能分析

## 功能

- 📈 实时股价、涨跌幅、成交量
- 💼 持仓管理（成本价、盈亏计算）
- 📊 技术指标：MACD（金叉/死叉）、KDJ（超买/超卖）、RSI
- 🔔 风险与机遇智能提示（多指标共振检测）
- 📋 从券商APP粘贴导入持仓数据
- 📱 自适应布局（手机 / 平板 / 折叠屏）

## 使用

直接用浏览器打开 `index.html` 即可使用，无需服务器。

## 打包 APK（PWA Builder 方式）

1. Fork 本仓库
2. 在仓库 Settings → Pages 中开启 GitHub Pages（选 main 分支）
3. 打开 [pwabuilder.com](https://www.pwabuilder.com)
4. 输入你的 GitHub Pages 地址（如 `https://你的用户名.github.io/仓库名/`）
5. 点击 "Package for stores" → Android → 下载 APK

## 技术栈

- 纯 HTML / CSS / JavaScript，零依赖
- 腾讯财经 API（免费，无需注册）
- PWA 支持（离线缓存、可安装）
- 响应式设计（CSS Grid + Media Queries）

## 数据来源

- [腾讯财经](https://qt.gtimg.cn) 实时行情
- 数据仅存储在浏览器 localStorage 中，不上传任何服务器
