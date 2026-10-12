# 两类来源与证据登记

核验日期：2026-10-09。源码结论均为静态读取，未运行候选应用。维护、实施、效果三类证据分开登记。固定 SHA 是本轮快照，不保证之后分支仍指向同一提交；没有用 Star 或提交总数判断成熟度。

## 一、自有积累

| 来源 | 当前核实内容 | 本轮用途 |
|---|---|---|
| [service-record.ts](../../../apps/web/src/lib/service-record.ts) | 15–38 服务计划/记录；80–88 初始化、对象锁定；92–136 事件与收尾检查 | 已有负责人/行动时间/转介与结果分离；没有新增字段才能做研究 |
| [service-case-service.ts](../../../apps/web/src/lib/service-case-service.ts) | 20–36 当前列表/历史；39–78 手动创建与上周期；81–98 版本检查/快照追加 | 记录关联与历史已经有；列表按更新时间取出 |
| [services/page.tsx](../../../apps/web/src/app/services/page.tsx) | 50–51 获取列表/详情；142–151 列表与联系日期；162–182 手动填写 | 当前逐项展示记录，没有专门的到期待办分组 |
| [民生扩展设计](../../product/livelihood-service-expansion.md) | 当前实现覆盖、LS-01～12 与未验证事项 | 方向/验收假设，不能当一线证据 |
| [任务卡](../../testing/usability/livelihood-scenario-cards.md)、[走查说明](../../testing/usability/livelihood-walkthrough-runbook.md) | 合成就业、助餐、探访任务与主持核对 | 可复用作下一阶段合成验证；没有参与者结果 |
| state/board.md、CLAUDE.md | 本轮启动前工作状态与项目规则 | 保留既有修改；研究只更新材料和交接记录 |

采用当前仓库定向读取与 git log，不宽扫描本机项目/私人历史。service 文件为当前未提交原型，git log 不提供发布证据。以前测试结果来自既有记录，本轮没有重跑或引用为候选项目运行证明。

## 二、他人积累：版本、许可、读取深度

| ID | 候选/平台 | 固定提交或读取范围 | 许可核查 | 维护与实施证据边界 |
|---|---|---|---|---|
| E01 | Primero / GitHub | main：8377bbec5277b13f4db74b50f87f2af982c80271；模型与 API 入口 | [LICENSE 9–17](https://github.com/primeroIMS/primero/blob/8377bbec5277b13f4db74b50f87f2af982c80271/LICENSE#L9)：AGPL-3.0-or-later；CPIMS+/GBVIMS+ 配置获取另有联系说明 | 固定 HEAD 已取；本轮未确认提交日期。官方 2026-05-20 DIY 文档说明实施职责/运维，不证明中国社区适用 |
| E02 | CHILL / GitLab | master：3f756b3fd2f0475d99ce037992fe5e9c3f9b09d2；实体与创建入口 | [LICENSE](https://gitlab.com/Chill-Projet/chill-bundles/-/blob/3f756b3fd2f0475d99ce037992fe5e9c3f9b09d2/LICENSE)：AGPLv3 | GitLab 公共 commit API：2026-10-08T04:12:48+08:00；官网称 Haute-Vienne/Vendée 使用，属维护者自述，未独立审计 |
| E03 | CiviCRM/CiviCase / GitHub | 98d1bef76e61b95bd8aa06e7df751aaa27f2b03c；提交→开案→时间线→活动关联 | [Case.php 6–8](https://github.com/civicrm/civicrm-core/blob/98d1bef76e61b95bd8aa06e7df751aaa27f2b03c/CRM/Case/BAO/Case.php#L6)：AGPLv3 + permitted exceptions；[官方许可说明](https://civicrm.org/about/license) | 官方 Atom 对固定提交记录 2026-10-09T09:11:45Z；研究期间 master 前进，证据仍固定。用户手册是配置依据，非本地部署证明 |
| E04 | CommCareHQ / GitHub | cf02984fc2d3c033f1925f6011746693a020dd53；接收表单→SQL 个案更新 | [LICENSE](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/LICENSE#L1)：BSD 3-Clause | 官方 Atom 对固定提交记录 2026-10-08T13:04:40Z；官方配置/部署文档，未核验中国社区使用 |
| E05 | OpenSPP2 / GitHub | 19.0：a71e8f04f6ecca91160afff79af868421a71b968；模块加载→界面→方法 | [LICENSE](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/LICENSE)：LGPL-3；单模块声明需分别看 | [固定提交补丁](https://github.com/OpenSPP/OpenSPP2/commit/a71e8f04f6ecca91160afff79af868421a71b968.patch)含 2026-10-08 活动；登记平台实施不等于 v2 个案模块上线 |
| E06 | CaseBridge / GitHub | 6f0adc51b610bbb6a757beaf630431615fc1483d；模型→持久化→路由注册 | 本轮根目录未见 LICENSE，固定 /LICENSE 返回 404：明确许可未找到，不能默认可搬代码；不推断法律结论 | 固定提交日期 2026-07-04T08:58:59+08:00；README 演示/checklist 是自述，真实部署未核验 |
| E07 | HSDS / GitHub + 官方文档 | 3.3.1/tag v3.3.1：606a72cc3ddd80f890b6422bc7bd53392764775a；schema 与范围 | [LICENSE 1–9](https://github.com/openreferral/specification/blob/606a72cc3ddd80f890b6422bc7bd53392764775a/LICENSE#L1)：CC BY-SA 4.0，属于规范/文档许可，不是应用许可证 | 固定提交日期 2026-08-26；有目录 API 采用说明，不证明个案转介闭环 |
| E08 | Bayes Platform / GitHub | main：d8665bfb56275469604cf53264386ec7452656e1；仅官方定位、README、许可 | [LICENSE](https://github.com/bayesimpact/bayes-platform/blob/d8665bfb56275469604cf53264386ec7452656e1/LICENSE#L1)：MIT | 官网描述 France Travail 使用，维护者自述；未追就业业务流程调用链，不列核心支持结论 |
| E09 | KinEcho / Gitee | a93f7252a59fe76ccd6efe7fb54035c8675edd0b；SQLite 表与日程/告警入口 | [原始 LICENSE](https://gitee.com/luobo_lin/KinEcho/raw/a93f7252a59fe76ccd6efe7fb54035c8675edd0b/LICENSE)：GPLv3 | git ls-remote 可取；提交页跳登录，日期未核验；测试用户是作者自述 |
| E10 | SmartSeniorHMOS / GitCode | HEAD 44a29fd596ee72a00259cc7ba979d577880c9023；README 索引、refs | 平台显示 Apache-2.0；固定许可请求返回 HTML 壳，正文未核验 | README 明确公开版是假数据、后端移除；源码调用链与维护日期未核验 |

### E01：Primero 的状态与实际入口

- [ReferralsController 11–24、60–88](https://github.com/primeroIMS/primero/blob/8377bbec5277b13f4db74b50f87f2af982c80271/app/controllers/api/v2/referrals_controller.rb#L11)：创建/更新入口授权，再调用 Referral.process!；更新参数是状态、退回原因及结果备注。
- [Transition 12–29、57–85](https://github.com/primeroIMS/primero/blob/8377bbec5277b13f4db74b50f87f2af982c80271/app/models/transition.rb#L12)：对象/用户/角色关联、同意和接收权限检查、创建回调。
- [Referral 30–96、128–141](https://github.com/primeroIMS/primero/blob/8377bbec5277b13f4db74b50f87f2af982c80271/app/models/referral.rb#L30)：发出、拒绝、接收、完成、同意；关联具体 service_record_id，内部指派接收用户。内部状态转换有源码依据，不代表实际机构回执或运行验证。
- [Serviceable 17–22、70–112](https://github.com/primeroIMS/primero/blob/8377bbec5277b13f4db74b50f87f2af982c80271/app/models/concerns/serviceable.rb#L17) 被 [Child 22–45、354–357](https://github.com/primeroIMS/primero/blob/8377bbec5277b13f4db74b50f87f2af982c80271/app/models/child.rb#L22) 加载，保存服务截止日期/执行时间并计算回访日期。
- [官方用户指南 Services](https://support.primero.org/docs/2dd4f7e2-943c-4544-9691-2fbef864f618) 区分系统内接收用户与外部提供方；[DIY 实施说明](https://support.primero.org/docs/36e8934e-4944-4093-b3a8-d71046f7da7f) 要求伙伴协调、信息共享流程和维护能力。CPIMS+ 领域并非中国养老/就业，不能照搬其个案分类。

### E02：CHILL 的路径、活动和责任历史

- [AccompanyingPeriod 239–245、288–331](https://gitlab.com/Chill-Projet/chill-bundles/-/blob/3f756b3fd2f0475d99ce037992fe5e9c3f9b09d2/src/Bundle/ChillPersonBundle/Entity/AccompanyingPeriod.php#L239)：参与对象、社会议题、路径步骤、步骤历史、负责人任期历史和工作活动关系。
- [AccompanyingPeriodWork 38–112](https://gitlab.com/Chill-Projet/chill-bundles/-/blob/3f756b3fd2f0475d99ce037992fe5e9c3f9b09d2/src/Bundle/ChillPersonBundle/Entity/AccompanyingPeriod/AccompanyingPeriodWork.php#L38)：工作关联路径、评估、目标、第三方、对象和负责人历史；referrer 在这里有负责人含义，不能单凭名字说是外部转介确认。
- [Controller 129–176](https://gitlab.com/Chill-Projet/chill-bundles/-/blob/3f756b3fd2f0475d99ce037992fe5e9c3f9b09d2/src/Bundle/ChillPersonBundle/Controller/AccompanyingPeriodController.php#L129)：取得已登录用户、对象权限、关联 Person、验证表单再持久化，说明实体被调用。
- [官方路径说明](https://www.chill.social/en/features/suivi-accompagnements/)列出互动、任务负责人/截止时间；[地方机构说明](https://www.chill.social/en/sector/collectivities/)是使用自述；[FAQ](https://www.chill.social/en/resources/faq/)指出无账号外部人员不能访问，完整逐人动作日志尚未提供。Gitea 是 GitLab 同项目的镜像，不能重复计数或用旧镜像日期替代当前源仓。

### E03：CiviCase 的活动与时间线

- [CaseContact.entityType.php 35–65](https://github.com/civicrm/civicrm-core/blob/98d1bef76e61b95bd8aa06e7df751aaa27f2b03c/schema/Case/CaseContact.entityType.php#L35) 关联 Case 与 Contact。
- [Form/Case.php 369–466](https://github.com/civicrm/civicrm-core/blob/98d1bef76e61b95bd8aa06e7df751aaa27f2b03c/CRM/Case/Form/Case.php#L369) 提交进入 [OpenCase 284–354](https://github.com/civicrm/civicrm-core/blob/98d1bef76e61b95bd8aa06e7df751aaa27f2b03c/CRM/Case/Form/Activity/OpenCase.php#L284)，创建对象关联并调用标准时间线；[XMLProcessor 490–547](https://github.com/civicrm/civicrm-core/blob/98d1bef76e61b95bd8aa06e7df751aaa27f2b03c/CRM/Case/XMLProcessor/Process.php#L490) 根据参考日期/偏移创建 Activity。
- [ActivityContact 80–90](https://github.com/civicrm/civicrm-core/blob/98d1bef76e61b95bd8aa06e7df751aaa27f2b03c/schema/Activity/ActivityContact.entityType.php#L80) 的 source/target/assignee 是活动关系，并非机构接单协议。
- [基本概念](https://docs.civicrm.org/user/en/latest/case-management/what-you-need-to-know/)、[日常操作](https://docs.civicrm.org/user/en/latest/case-management/everyday-tasks/)支持计划回访设计；预生成日期不会自动随参考日期改变，应视为配置边界，不能假定智能滚动排期。

### E04：CommCare 的当前个案更新与旧协议反证

- [cases.py 304–337、1085–1108](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/corehq/form_processor/models/cases.py#L304) 定义对象属性/owner/状态和父子索引。
- [receiverwrapper urls 5–14](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/corehq/apps/receiverwrapper/urls.py#L5) → [views 181–204](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/corehq/apps/receiverwrapper/views.py#L181) → [SubmissionPost 548–567](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/corehq/form_processor/submission_post.py#L548) → [SQL processor 220–264](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/corehq/form_processor/backends/sql/processor.py#L220)；不是仅看到 Case 文件名。
- [update_strategy.py 96–179](https://github.com/dimagi/commcare-hq/blob/cf02984fc2d3c033f1925f6011746693a020dd53/corehq/form_processor/backends/sql/update_strategy.py#L96) 107–112 检测并拒绝旧 referral XML，168–179 更新动态属性。
- [现行 Referrals 文档](https://dimagi.atlassian.net/wiki/spaces/commcarepublic/pages/2143954936/Referrals)采用表单条件、列表筛选或子个案；子个案关闭与父个案分开。[Case Configuration](https://dimagi.atlassian.net/wiki/spaces/commcarepublic/pages/2143947182/Case+Configuration) 是配置依据。不能把配置可能性写成现成跨机构协议。

### E05：OpenSPP 登记与个案模块

- [登记桥接 case.py 7–94](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_registry/models/case.py#L7) 关联个人/家庭/成员与历史个案；[case_visit 13–64](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/models/case_visit.py#L13)提供探访记录。
- [models/__init__.py](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/models/__init__.py#L1) → [manifest 18–36](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/__manifest__.py#L18) → [菜单 68–74](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/views/case_menus.xml#L68) → [视图按钮 303–335](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/views/case_activity_views.xml#L303) → [referral 方法 101–117](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/models/case_referral.py#L101)：内部点击直接改变状态。
- [referral 25–74](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/models/case_referral.py#L25) 记录提供方文本、转介人、跟进和结果；[intervention 47–68](https://github.com/OpenSPP/OpenSPP2/blob/a71e8f04f6ecca91160afff79af868421a71b968/spp_case_base/models/case_intervention.py#L47) 责任是角色枚举+provider_id，不等于每项干预绑定具体工作人员。
- [UNDP/Co-Develop 报告第 7 页](https://www.undp.org/sites/g/files/zskgke326/files/2024-06/electronic-version-co-develop_rapid-deployments-using-shared-infrastructure-report_english_e-version.pdf)提及老挝登记平台选择 OpenSPP，第 12 页说明访谈方法；不能外推为当前 v2 转介模块已现场验证。

### E06：CaseBridge 的中文近似领域

- [models.py 28–100](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/db/models.py#L28) 是 Client/CaseRecord/CaseNote/Resource/Referral；转介模型未见独立接收方账号/责任字段。
- [服务模型 11–35](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/db/service_plan_models.py#L11) → [repository 27–81](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/db/service_plan_repository.py#L27) → [goals 路由 109–142](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/routers/goals.py#L109)：计划/介入实际持久化。
- [persistent_repository 251–312](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/db/persistent_repository.py#L251) → [referrals 路由 26–60](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/routers/referrals.py#L26) → [main 注册 59–63](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/apps/api/app/main.py#L59)：内部有写权限的社工更新状态，附协议检查/审计；不等于接收机构确认。
- [README](https://github.com/selinyi123/casebridge/blob/6f0adc51b610bbb6a757beaf630431615fc1483d/README.md#L42) 的演示与阶段清单单独看；未见明确许可，真实机构使用未验证。

### E07～10：标准与邻近方向

- HSDS [service.json 25–35、113–148、190–199](https://github.com/openreferral/specification/blob/606a72cc3ddd80f890b6422bc7bd53392764775a/schema/service.json#L25) 描述机构、服务营业状态、申请过程和资格；[contact.json 25–46](https://github.com/openreferral/specification/blob/606a72cc3ddd80f890b6422bc7bd53392764775a/schema/contact.json#L25)关联联系人，[metadata.json 24–100](https://github.com/openreferral/specification/blob/606a72cc3ddd80f890b6422bc7bd53392764775a/schema/metadata.json#L24) 是资源变更溯源。[官方 FAQ](https://docs.openreferral.org/en/v3.3.1/hsds/hsds_faqs.html#what-s-not-in-the-hsds)明确不包含实际个案转介、预约和跟进。采用例子是[目录 API](https://openreferral.org/michigan-211s-new-resource-data-infrastructure-providing-social-service-information-as-a-service/)。
- Bayes：[官方平台介绍](https://www.bayesimpact.org/platform/)描述就业助手、版本与评估机制；[固定 README](https://github.com/bayesimpact/bayes-platform/blob/d8665bfb56275469604cf53264386ec7452656e1/README.md)描述 NestJS/React 平台。只作为邻近 AI 线索，未验证其就业规则或端到端行为，不引用覆盖人口或宣传指标作为效果。
- KinEcho：[app.py 固定源码](https://gitee.com/luobo_lin/KinEcho/raw/a93f7252a59fe76ccd6efe7fb54035c8675edd0b/server/app.py) 115–144 是用户/日程表，262–283 告警表，598–623 处理人/回复入口，1534–1563 更新日程状态；这不等同机构转介。[README](https://gitee.com/luobo_lin/KinEcho/raw/a93f7252a59fe76ccd6efe7fb54035c8675edd0b/README.md) 203–204 的识别/情绪接口是预留，不能宣称已完成。
- [SmartSeniorHMOS 仓库](https://gitcode.com/CAPTAIN1275/SmartSeniorHMOS)：只核查到 README 索引、平台声明和 refs；没有取得可用固定源码内容，不用模块名字判支持。

## 三、检索范围、排除和访问限制

补充框架：[世界银行 Case Compass](https://case-compass.org/Home/Guide/CaseCompassFramework)把老年人、失业者等列为服务群体，区分信息指引、转介和专业个案工作。只用于界定服务强度；它不是开源应用，也不能证明 OneCase 的本地需求或优先级。

| 入口/检索式（代表性） | 结果/处置 |
|---|---|
| open source social services case management referral elderly unemployment GitHub | 获取 Primero、社会保护平台等；只用官方仓/文档作技术依据 |
| Primero CPIMS open source case management referral github | 先完成源码/许可抽查，找到内部与外部转介边界 |
| 开源 社工 个案管理 养老 服务 转介 GitHub Gitee | CaseBridge、KinEcho 作为代表；无许可或仅教育演示不提升为成熟案例 |
| site:gitlab.com social services case management；Chill social software open source social workers Gitlab | 找到 CHILL 的官方 GitLab 源仓，另见政策文档；政策文档不是软件 |
| site:codeberg.org elderly care social case management | robots.txt 阻挡，记作检索限制，不能说该平台没有候选 |
| GitCode 养老/SmartSeniorHMOS | 公开演示边界可读，源码/许可正文受限 |
| open source public employment services case management software | Bayes 公共就业 AI 作为邻近线索；商业 WCC/Mareto 不算开源候选，个人求职 tracker 与工作人员帮扶用户不同 |
| Sahana Eden / official | [官方页面](https://sahanafoundation.org/products/eden/)为 Legacy Archive，属于救灾/应急工具；本轮不深入比对，避免扩大候选 |
| Gitea CHILL mirror | 同项目镜像；页面抓取曾停在 2025-08，改以 GitLab 当前固定提交取材 |

本轮未做穷尽检索，也未独立审计部署或效果。GitHub 未认证 API 限流；改用 git ls-remote/raw/官方文档。外部源码只读取、不执行；部分原始文件暂存忽略的 resources/001_livelihood-open-source，正式依据是上述固定链接与原创判断。没有真实居民数据、外部消息、clone、安装或付费模型。
