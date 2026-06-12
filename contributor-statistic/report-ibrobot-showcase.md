# 贡献者统计报告 — ibrobot-showcase

> 分析时间: 2026-06-12 | 时间范围: 全部历史 | 仓库: https://github.com/2012geek/ibrobot-showcase

## 总览

| 贡献者 | 提交数 | 新增行数 | 删除行数 | 涉及文件数 |
|--------|--------|----------|----------|------------|
| liyi | 25 | 8,799 | 2,556 | 31 |
| hezhenhao2 | 7 | 8,159 | 22 | 24 |
| yanhan | 7 | 4,284 | 90 | 15 |
| liqiliang | 4 | 559 | 34 | 4 |
| nice-xuzhang | 3 | 4,312 | 1,273 | 13 |
| OpenClaw Agent | 1 | 1,416 | 0 | 10 |


---

## liyi (liyi245@huawei.com)

**贡献概述**: liyi 是项目的核心架构与功能开发者，主导了语音交互与智能对话系统的构建。他引入了核心语音功能及 TTS 服务，奠定了项目的语音交互基础架构；同时新增 robot_agent 模块，赋予了机器人智能对话回复能力。此外，他实现了机器人的反馈机制以完善人机交互闭环，并扩展了多个前端页面与用户入口。在架构优化层面，他引入了 session 识别机制以解决多对话并发管理问题，并对前后端进行了大范围重构。他的工作深刻塑造了项目的交互体验与底层架构。

**主要贡献领域**: docs、README.md、communication、frontend、scripts、test_prompt_and_rounds.py、asr_service、restart-all.sh、.gitignore、g2pW、test-chat.sh

**关键提交**:
- [语音功能添加](https://github.com/2012geek/ibrobot-showcase/commit/a02b424a1d99d0f9441bb487de9960d4fe798412) — 引入了项目的核心语音功能，包括TTS服务、语音代理和配置等关键模块，代码量极大（1314行新增），是项目的里程碑式提交，奠定了语音交互的基础架构
- [添加对话回复功能](https://github.com/2012geek/ibrobot-showcase/commit/4eca5fa9d48b10a6d57053c29d5ff5afdbceac53) — 新增了robot_agent.py模块，实现了核心的对话回复功能，改变了系统的交互架构，使机器人具备了智能对话能力，属于关键功能实现
- [添加机器人反馈机制](https://github.com/2012geek/ibrobot-showcase/commit/69afc7de1b0a870636d158a347c62ba7f2b2e346) — 实现了机器人的反馈机制，涉及前后端7个文件的806行代码修改，包括交互脚本和界面，是完善人机交互闭环的重要功能特性
- [前端界面修改](https://github.com/2012geek/ibrobot-showcase/commit/61fad3e21d302a73171171de673649617aa340ce) — 引入了desktop.html、landing.html等多个新前端页面和qrcode.min.js，扩展了项目的前端架构和用户入口，1288行新增代码，对项目结构影响显著
- [音频播放修改,添加session识别不同对话](https://github.com/2012geek/ibrobot-showcase/commit/0c9e42482255ea1edbf2e2020bddf7ee6f677dfe) — 引入了session识别机制以区分不同对话，解决了多对话并发管理的架构问题，涉及前后端7个文件的大范围重构（913行删除），属于关键架构改进


---

## hezhenhao2 (hezhenhao2@noreply.gitcode.com)

**贡献概述**: hezhenhao2 是该项目机器人动作与技能体系的奠基者。他主导建立了机器人动作的录制与回放机制，引入了基础的录制与回放脚本，为动作控制与测试确立了起点。随后，他实现了主机与客户端的分布式动作回放，支持端边协同架构下的动作执行，并补充了反向回放功能，极大提升了动作验证的灵活性。此外，他大规模构建了机器人的核心技能模块，涵盖鞠躬、握手等多种动作的配置与统计数据，全面定义了机器人的具体动作能力，对项目功能架构具有深远影响。

**主要贡献领域**: scripts、skills

**关键提交**:
- [add record & replay action scripts](https://github.com/2012geek/ibrobot-showcase/commit/098445ce705d1b856d917ed4ec4f1e09875a01a6) — 引入了机器人动作的录制与回放基础脚本，是项目实现动作控制、测试和演示的核心功能起点，具有里程碑意义
- [add skills](https://github.com/2012geek/ibrobot-showcase/commit/7bea2add12bebb354f03797bad62144074529511) — 大规模引入了机器人的核心技能配置与统计数据模块（7371行，10个文件），定义了机器人的具体动作能力，影响范围极广且功能极为重要
- [Add replay action host & client scripts](https://github.com/2012geek/ibrobot-showcase/commit/0ed94974be0b3c7e4fae0963a8d3787d111bc123) — 实现了主机与客户端的分布式动作回放脚本，支持端边协同架构下的动作执行，对项目整体架构有重要影响
- [add reversely replay actions](https://github.com/2012geek/ibrobot-showcase/commit/6450d7dcd9034b27cd2c242919ba7bf017b7cbbb) — 补充了反向回放动作脚本，完善了动作测试与验证的灵活性，是对核心回放功能的重要扩展


---

## yanhan (yanhan31@huawei.com)

**贡献概述**: yanhan 是该项目的全栈奠基人，主导了语音识别服务与前端交互架构的从零构建。他通过 init_asr 提交搭建了完整的 ASR 语音识别服务，整合了 Docker 部署与 Nginx 配置，为项目提供了关键的语音交互基础设施。同时，他通过 add_station 提交从零构建了前端 station 模块，确立了基于 Flask 的前端核心架构与 UI 交互体验。此外，他还引入了测试脚本并修复了时间戳问题，有效保障了端边协同场景下的数据同步与系统可验证性。

**主要贡献领域**: frontend、asr_service

**关键提交**:
- [init_asr](https://github.com/2012geek/ibrobot-showcase/commit/e059bf1e2e71252b971d52e34d7e61e2608fec88) — 初始化并构建了完整的ASR（语音识别）服务，引入了Docker部署、Nginx配置及核心脚本，为项目提供了关键的语音交互基础设施，深刻影响了系统架构
- [add_station](https://github.com/2012geek/ibrobot-showcase/commit/283bb3f8742bed74bb6a751e5d29c86aedc17134a) — 从零搭建了前端展位（station）模块，引入了Flask应用结构、配置文件及前端UI资源，确立了项目的前端核心架构，是前端功能的里程碑
- [Add test script and fix timestamp](https://github.com/2012geek/ibrobot-showcase/commit/239bdd27dbe0c9feddc265da75c8dda04c149f53) — 引入了测试脚本增强了系统的可验证性，并修复了时间戳问题，这对端边协同系统中的数据同步与实时交互至关重要


---

## liqiliang (58988085+liqiliang9090@users.noreply.github.com)

**贡献概述**: liqiliang 是该项目的奠基者，通过“Initial commit”完成了项目的初始化工作。他创建了项目的基础结构，包括 .gitignore、LICENSE 和 README.md，并引入了无线技术架构文档。这一里程碑式的提交为项目后续的端边协同方案、机器人控制及语音交互等核心功能的开发奠定了坚实基础。虽然他仅进行了少量提交，但其工作确立了项目的起点与整体框架，对项目的长远演进起到了至关重要的引领作用。

**主要贡献领域**: docs、README.md、.gitignore、LICENSE

**关键提交**:
- [Initial commit](https://github.com/2012geek/ibrobot-showcase/commit/1ac6ac83dc1a7a33f7ecda177970db64b660e5bf) — 项目初始化提交，创建了项目的基础结构（.gitignore, LICENSE, README.md），是整个项目的起点和里程碑，为后续的架构设计、端边协同方案、机器人控制及语音交互等核心功能的开发奠定了基础。


---

## nice-xuzhang (nice-xuzhang@noreply.gitcode.com)

**贡献概述**: nice-xuzhang 是该项目的基础架构奠基人与核心链路打通者。他主导了系统从零到一的搭建，在“初版运行打通”里程碑提交中，首次实现了语音代理、前端界面与控制脚本的端到端完整运行，确立了项目的基础架构。随后，他推动了“端到端2秒版本”的关键性能突破，将实时交互延迟优化至2秒，大幅提升了人机交互体验。此外，他还重构了机器人运行数据与脚本的存放结构，优化了项目组织与部署逻辑，保障了系统的高效迭代与稳定运行。

**主要贡献领域**: .gitignore、asr_service、communication、docs、scripts、test-chat.sh、restart-all.sh

**关键提交**:
- [初版运行打通](https://github.com/2012geek/ibrobot-showcase/commit/1c817ccfe62bb17e19aef27a0050cb04fd4e69ae) — 项目里程碑：首次实现系统端到端的完整运行，从零到一打通了语音代理、前端界面与控制脚本的核心链路，奠定了项目的基础架构
- [端到端2秒版本](https://github.com/2012geek/ibrobot-showcase/commit/7a2a54f635067e6bafcda589b5c5052cd0942826) — 关键性能突破：将端到端交互延迟优化至2秒，这对于实时人机交互体验至关重要，属于核心功能的重大升级和性能问题的修复
- [调整机器人运行数据和脚本存放](https://github.com/2012geek/ibrobot-showcase/commit/bf4dd4d9b28a11998e004a900b30b3b28006a123) — 架构影响：重构了项目的运行数据与脚本存放结构，优化了项目整体的组织架构和部署逻辑，影响了多个核心服务和配置文件


---

## OpenClaw Agent (agent@openclaw.ai)

**贡献概述**: OpenClaw Agent 是该项目工程化落地与核心交互模块的奠基者。他主导引入了通信与语音交互核心功能，实现了语音代理服务及ASR服务前端界面，打通了系统的语音交互链路。在里程碑提交“添加通信和语音进行交互,并增加了部署脚本和检查脚本”中，他不仅构建了核心业务模块，还一手搭建了项目的部署与运维体系，完善了部署文档、状态检查及服务启停脚本。这一工作为项目的架构扩展与工程化落地奠定了坚实基础。

**主要贡献领域**: DEPLOYMENT.md、asr_service、check-status.sh、communication、restart-all.sh、start-asr.sh

**关键提交**:
- [添加通信和语音进行交互,并增加了部署脚本和检查脚本](https://github.com/2012geek/ibrobot-showcase/commit/e0675ce602840782ab7989ad72166446a0087fd8) — 引入了通信与语音交互核心模块及ASR服务界面，构建了项目的部署与运维体系（包含部署文档、检查与重启脚本），新增1416行代码且涉及10个关键文件，对项目的架构扩展、核心功能实现及工程化落地具有重大里程碑意义


---


*报告由 contributor-statistic skill 自动生成*
