# Copilot Instructions

## Project Guidelines
- 禁止执行 npx eslint 命令
- 开发过程中，除非用户明确要求，工程实现应尽量暴露问题；不要使用“兜底/尽量可用/尽量显示”的次优回退路径，应在关键数据缺失时报错并提示。
- 技能设计的主文档是 skill_design.md，不是 skill_balance_design.md；涉及技能设计规则时应优先更新 skill_design.md。