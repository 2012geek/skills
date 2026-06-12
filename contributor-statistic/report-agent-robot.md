# 贡献者统计报告 — agent-robot

> 分析时间: 2026-06-12 | 时间范围: 全部历史 | 仓库: https://github.com/2012geek/agent-robot

## 总览

| 贡献者 | 提交数 | 新增行数 | 删除行数 | 涉及文件数 |
|--------|--------|----------|----------|------------|
| Chenlening | 30 | 19,577 | 1,719 | 45 |
| hezhenhao2 | 7 | 35,748 | 692 | 155 |
| yian-chen | 3 | 201 | 0 | 1 |
| Zhenhao He | 2 | 0 | 0 | 0 |
| chenlening | 1 | 0 | 0 | 0 |
| scoyer | 1 | 1,027 | 83 | 2 |


---

## Chenlening (chenlening@huawei.com)

**贡献概述**: Chenlening 是项目的核心架构师与开发者，主导了 tech-insight 技能模块从奠基到重大演进的完整过程。他不仅初始引入了 tech-insight 和 github-pr-workflow 技能奠定了功能基础，更推动了 v2 流水线的核心跃迁，实现了9大会议源覆盖与中文输出支持。随后，他对该技能进行了架构级重构，引入上下文感知动态搜索机制，根本性地优化了运行方式。此外，他还定义了项目的系统架构蓝图，并引入 Stack Generator 关键组件以支持 AI 生成定制化训练与推理栈，持续拓展了系统的核心能力边界。

**主要贡献领域**: .claude、docs、.gitignore、upgrade_gh.sh、pyproject.toml

**关键提交**:
- [feat: add tech-insight skill, github-pr-workflow skill, and insight reports](https://github.com/2012geek/agent-robot/commit/5cd4a8e7f3ab4ef77b673865ecd5d0c1f41c9702) — 里程碑提交：首次引入 tech-insight 和 github-pr-workflow 两个完整技能模块，奠定了项目核心功能基础，影响10个文件、2120行新增代码
- [feat: tech-insight v2 pipeline — 9-conference coverage, Chinese output, registry updates](https://github.com/2012geek/agent-robot/commit/f7542fdf4a657ce6f5491d865debf263fceab117) — v2流水线的核心实现提交，新增3253行代码，覆盖9个会议源、中文输出和注册表更新，代表项目从v1到v2的重大功能跃迁
- [feat: optimize tech-insight skill with context-aware dynamic search](https://github.com/2012geek/agent-robot/commit/ae632a47d3a48c5908d88b49a8b56139a0c2335c) — 对tech-insight技能进行了架构级重构，引入上下文感知动态搜索机制，影响全部10个组件文件，从根本上改变了技能的运行方式
- [Add system architecture design document](https://github.com/2012geek/agent-robot/commit/cae4a1c3c31bf4f7fd1b9b7e42b0490922e81eb5) — 项目系统架构设计文档的奠基提交，802行新增，定义了整个项目的架构蓝图和方向，是项目架构层面的里程碑
- [Add Stack Generator component for AI-generated custom training/inference stacks](https://github.com/2012geek/agent-robot/commit/3f3f4047d9a694bba7881cebd63740a06f7dd6c1) — 引入Stack Generator关键架构组件，支持AI生成定制训练/推理栈，1026行新增，扩展了系统架构的核心能力边界


---

## hezhenhao2 (hezhenhao2@noreply.gitcode.com)

**贡献概述**: hezhenhao2 是 VLA Factory 框架的核心架构师，主导了项目从零到一的构建。他奠定了框架的基础架构，引入协议定义、模型注册机制与YAML配置解析器作为骨架支撑。在数据处理上，他自建数据管线并引入规范的中间表示替代旧依赖，夯实了数据流基石。随后，他实现了PyTorch训练引擎与CLI，使框架真正走向可用；并通过引入ACT模型及适配器模式，确立了多模型扩展的统一范式。此外，他完成对接LeRobot与OpenPI的MVP训练器桥接，成功打通了仿真到训练的核心链路。

**主要贡献领域**: docs、scripts、vla_factory、pyproject.toml、platform、.gitignore、pipelines、integrations、dependencies、specs

**关键提交**:
- [feat(vla-factory): add protocols, model registry, and YAML config parser](https://github.com/2012geek/agent-robot/commit/607e5642d81be69626ac42b376fdd047af305d71) — 奠定了VLA Factory的核心架构基础，引入了协议定义、模型注册机制和YAML配置解析器，为后续所有模块的扩展和集成提供了骨架支撑，是项目架构的重大转折点。
- [feat(vla-factory): add self-built data pipeline with canonical IR, replacing forge](https://github.com/2012geek/agent-robot/commit/44acb4d9a4bb7e0ebd6bb454b241c7c7b65ac07d) — 重构了数据处理架构，引入了规范的中间表示(Canonical IR)并替换了旧版forge依赖，这是VLA训练框架中最核心的数据流基石，影响范围广（2903行新增），具有极高的架构和功能重要性。
- [ feat(vla-factory): add training engine, CLI, and disk-cached video decoder](https://github.com/2012geek/agent-robot/commit/1f99eaa8b7f18b44636e0bf457ff862700b850c7) — 实现了VLA Factory的可执行核心，添加了PyTorch训练引擎、命令行工具(CLI)及磁盘缓存视频解码器，使框架从设计走向实际可用，是核心功能的关键实现。
- [feat(vla-factory): add ACT model with adapter pattern and vendor fallback](https://github.com/2012geek/agent-robot/commit/d03733ffb62708f346d072df0512bcb7747bad4d) — 引入了首个核心VLA模型(ACT)，并确立了适配器模式与供应商回退机制，为多模型接入建立了统一的架构范式，对项目的可扩展性和模型支持具有深远影响。
- [feat: add MVP VLA trainer bridge implementation](https://github.com/2012geek/agent-robot/commit/d0d0039bdc4dd81ca247e85c0b88c8296f3d1e12) — 实现了MVP级别的VLA训练器桥接模块(对接LeRobot和OpenPI)，代码量巨大（4345行新增），是项目早期打通仿真到训练链路的关键里程碑，验证了核心可行性。


---

## yian-chen (leningchen@163.com)

**贡献概述**: yian-chen 是该项目的创始者与基石构建者。他通过项目的初始提交创建了 LICENSE 文件，确立了项目的开源许可规范，这一里程碑式的举动标志着项目的正式诞生。作为所有后续代码和开发工作的起点，他的这一奠基性贡献为整个项目赋予了最初的合法身份与发展脉络，没有此提交则项目无从谈起。

**主要贡献领域**: LICENSE

**关键提交**:
- [Initial commit](https://github.com/2012geek/agent-robot/commit/f0d9c7be5dbdd617f7677a7c7d78f0da06a83bde) — 项目的初始提交，创建了项目根基（LICENSE文件），标志着项目的正式诞生，具有里程碑意义。作为所有后续提交的起点，没有此提交则整个项目不存在。


---

## Zhenhao He (scoyer@163.com)

**贡献概述**: Zhenhao He 是项目的架构设计核心推动者，确立了系统的顶层设计与技术演进方向。他主导引入了 VLA Model Factory 架构文档，定义了 Vision-Language-Action 模型工厂的核心设计，为后续 ACT 模型及训练引擎等关键特性的开发奠定了基石。同时，他更新了系统架构定位文档，明确了“仿真-训练-推理”一体化平台的整体架构方向，为项目的模块划分与功能开发提供了清晰的顶层指导。

**关键提交**:
- [Merge pull request #7 from 2012geek/vla-model-factory-architecture-docs](https://github.com/2012geek/agent-robot/commit/229a64c943a4394971ab4323e3b6d46069669455) — 合并引入了 VLA Model Factory 架构文档，这是项目的重大架构里程碑。该架构定义了 VLA（Vision-Language-Action）模型工厂的核心设计，后续多个关键特性提交（ACT模型、训练引擎、数据流水线、协议与注册表）均以此架构为基础实现，具有极高的架构影响力和里程碑意义。
- [Merge pull request #4 from 2012geek/update-system-architecture-sim-train-infer](https://github.com/2012geek/agent-robot/commit/3284f448864808873321618fc13e128d6ffad320) — 合并更新了系统架构定位文档，明确了仿真-训练-推理（sim-train-infer）一体化平台的整体架构方向。该更新为项目后续的功能开发和模块划分提供了顶层设计指导，具有重要的架构影响和方向性里程碑意义。


---

## chenlening (leningchen@163.com)

**贡献概述**: chenlening 在项目中发挥了关键的整合与交付作用，主导了 tech-insight v2 skill 重大特性的集成落地。通过执行关键的里程碑合并提交，他正式将包含 9-conference coverage、中文输出支持及 registry 更新等核心功能引入项目主分支。此举标志着该重大特性的全面完成与交付，极大丰富了项目的技术洞察技能体系，对项目整体发展具有里程碑意义。

**关键提交**:
- [Merge pull request #8 from 2012geek/feature/tech-insight-skill](https://github.com/2012geek/agent-robot/commit/7c8cd376669f0aeafd30bac5f900a6386e8fac2a) — 作为关键的里程碑合并提交，正式将 tech-insight v2 skill 的核心功能更新（包括 9-conference coverage, Chinese output, registry updates 等）集成到项目主分支，标志着该重大特性的完成与交付


---

## scoyer (scoyer@163.com)

**贡献概述**: scoyer 是项目架构规划的核心贡献者，通过一次大规模的文档重构确立了项目发展的里程碑式方向。他全面更新了系统架构定位文档，大幅扩充了千余行内容，并补充了开源平台集成洞察。此次重构不仅系统明确了项目整体架构的演进路线，还详细阐述了开源平台集成策略，为项目后续的技术演进与生态融合奠定了坚实的规划基础。

**主要贡献领域**: docs

**关键提交**:
- [docs: update system architecture positioning](https://github.com/2012geek/agent-robot/commit/a8ebcc065f549c954b34e13f2185efdee9b20d81) — 大规模重构了系统架构定位文档，新增1027行内容，明确了项目整体架构演进方向与开源平台集成策略，对项目后续发展具有里程碑式的指导意义


---


*报告由 contributor-statistic skill 自动生成*
