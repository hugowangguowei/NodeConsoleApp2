# Buff Editor v3 测试日志（规范版）

> 本文档用于记录 `test/buff_editor_v3.html` 的功能验证结果，作为后续回归测试/缺陷追踪依据。

测试时间：2026-01-18-14:20 

## 1. 测试信息

- 测试工具：`test/buff_editor_v3.html`
- 测试数据：
  - Buff：`assets/data/buffs.json`
  - Enemy：`assets/data/enemies.json`
  - Player：`assets/data/player.json`
- 测试重点：

## 2. 统一问题（General Issues）


## 3. 具体 Buff 测试记录（Per-Buff）

> 说明：以下条目以“现象”为准，buffId 以 `buffs.json` 内实际 id 为准。



## 4. 本轮回归方案（基于结论）

> 目标：把本轮测试中“结论”固化为回归用例，后续每次修改 `buffs.json` / `BuffSystem` / `buff_editor_v3.html` 后都可以重复执行，快速确认没有回归。


### 4.3 回归结果记录格式（建议）

- 测试时间：
- 测试页面版本：
- 数据版本：`assets/data/buffs.json`（记录主要改动点即可）
- 回归结果：
  - R-01: PASS
  - R-02: PASS
  - R-03: PASS/FAIL
  - R-04: PASS/FAIL
  - R-05: PASS/FAIL
