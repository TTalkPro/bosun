# 前端 UI 优化：项目看板 + 拖拽 + 外壳样式（参照 shadcnuikit.com/dashboard）

日期：2026-11-25　状态：已完成，未提交

## 目标

参照 shadcn UI kit 的 Kanban / Tasks / Dashboard 页面，把看板从「Epic 详情里的小组件」升级为项目页的主视图，拖拽更顺手，整体样式向 shadcn dashboard 靠拢。

## 改动

### 看板（`web/src/features/board/`）
- 新 `KanbanBoard` + `KanbanCard`，项目页与 Epic 步骤共用；旧 `features/epics/EpicKanban.tsx` 删除。
- 拖拽换成 `@dnd-kit/core`（新依赖 `@dnd-kit/core`、`@dnd-kit/utilities`）。原来的 HTML5 DnD 没有跟手预览、触屏不能拖、键盘不能拖：
  - 指针（移动 6px 起拖，点击仍是打开任务）、触屏（长按 180ms）、键盘（空格拿起，左右键直接跳到下一个**可放**的列，空格放下，Esc 取消；读屏有中文播报）。
  - `DragOverlay` 跟手卡片（微倾斜 + 阴影），原位留虚线占位；拖动时合法目标列虚线高亮、悬停加实线和光晕，不合法列变暗且不接收放置。
  - 规则在 `board/rules.ts` 的 `canMove`：严格按状态机一步迁移；被阻塞的任务不能从 NEW 拖进「进行中」。
- **拖拽不再绕过评审说明**：以前看板拖到「已完成」「已拒绝」等直接调 transition，不带证据也不带原因。现在与详情页按钮同一套：
  - 开始（NEW → IN_PROGRESS）直接提交；
  - 完成 / 验收 → 弹完成证据面板（`CompletePanel`，自验收时的测试证据规则照旧）；
  - 打回 / 拒绝 / 撤销 / 恢复 / 重新提交 → 弹说明面板（`TransitionPanel`）；
  - 面板关掉没提交，卡片回到原列（乐观移动撤回）。
- 列：状态图标 + 顶部色条 + 计数徽标；「新建」列有 + 与底部「新建任务」；每列可折叠成竖条（折叠后仍可放置），折叠状态存 localStorage（项目页 `bosun.board.collapsed`，Epic 页 `bosun.board.epic.collapsed`），缺省折叠「已拒绝」「已撤销」。
- 列内排序：优先级高 → 低，再按更新时间新 → 旧（后端没有手动排序字段，所以列内不做拖动排序）。
- 卡片：优先级、Epic 标记、标签（最多 2 个 + “+n”）、标题（真链接）、被阻塞 / 待回答 / 所属 Epic、Epic 进度条、底部 `#序号`、反馈数、提交数、更新时间、执行人头像（未领取显示虚线占位）；悬停出 ⋯ 菜单（打开 / 复制 ID / 移动到…），替代原来的原生 `<select>`。

### 项目页（`pages/ProjectTasksPage.tsx`、`features/tasks/TaskFilters.tsx`）
- 「看板 / 列表」视图切换，写进 URL `?view=`，并记在 localStorage `bosun.tasks.view`（缺省看板）。
- 看板模式一次取 500 条（后端单页上限），状态筛选决定显示哪些列；超过 500 条时页头提示用筛选缩小范围。
- 看板模式新建任务后留在看板上，不跳详情；列表模式照旧跳详情。
- 筛选条改成 shadcn tasks 风格：搜索框 + 「状态」多选弹层（带图标）+ 全部 / 任务 / Epic 分段 + 「重置」；视图切换在右侧。

### 列表：列显隐 + 分页（参照 shadcn tasks 页）
- 工具条右侧「显示列」菜单（`features/tasks/ColumnsMenu.tsx`）：状态 / 优先级 / 标签 / 提出人 / 执行人 / 反馈 / 更新（查询页多一列「项目」）可勾选隐藏，ID 和标题始终显示；勾选时菜单不关；有隐藏列时按钮上显示「5/7」。存 localStorage：项目页 `bosun.tasks.columns`，BQL 查询页 `bosun.query.columns`（两张表各记各的）。只在列表视图出现。
- 表格底部分页：「51–60，共 62 个任务」、每页行数 10 / 25 / 50 / 100、「第 x / y 页」、首页 / 上一页 / 页码（`1 … 9 10 11 … 20`，只差一页时不省略）/ 下一页 / 末页。
- 每页行数写进 URL（项目页 `?size=`，非 25 时才写；查询页 `?size=`），并记在 localStorage `bosun.tasks.pageSize`；换行数时跳到包含当前第一行的那页。
- 逻辑在 `features/tasks/columns.ts`（`useHiddenColumns`、`pageWindow`、`tableColumns`），单测 `test/columns.test.ts`。

### 项目列表页：统计卡片 + 动态图（参照 dashboard）
- 后端新增只读接口 `GET /api/v1/stats?days=14&tz=<分钟>`（`bosun_core/src/bosun_stats.erl` + `bosun_web/src/bosun_web_stats_h.erl`）：
  - 按项目给 `by_status`（六个状态都有）、`total`、`open`（NEW + IN_PROGRESS + DONE）、`epics`、`blocked`、`open_questions`，以及合计 `totals`；
  - `daily`：最近 N 天（1..90，缺省 14）每天新建数与「完成」数（迁移到 DONE 的历史条目，打回后再完成会再记一次）；按 `tz` 时区偏移分天（前端传浏览器时区），日期与用户日历一致；
  - 作用域同 `bosun_project:list/1`（组织 + API key 项目白名单）；含归档项目；参数写坏按缺省、越界夹住；
  - 阻塞 / 待回答只对未结任务计算（顺带省掉已结任务的链与反馈读取）；`bosun_json:open_question/1` 导出复用。
  - 测试：eunit `stats overview`（计数、按天分桶、窗口外、参数夹取）；ct `org_isolation` 补了统计只数本组织、坏参数按缺省。
- 前端 `pages/ProjectsPage.tsx` + `features/dashboard/`：
  - 四张统计卡片：未结任务（近 7 天新建）、进行中（被阻塞数）、待验收（待回答提问数）、近 7 天完成（较前 7 天环比，涨绿、跌只灰不红）；卡片数字跟「显示已归档」开关走（只加看得见的项目）。
  - 「近 14 天动态」分组柱图：新建 / 完成两个系列用 dataviz 参考调色板 1、2 号位（`--series-1/2`，明暗各一档，已用校验脚本对白色 / 深色卡片面过了色盲区分度与对比度）；柱宽封顶 14px、顶端 4px 圆角、组内 2px 空隙；图例常显；整天一列是悬停热区，提示框在该列旁边；另有给读屏的隐藏表格。图含归档项目（标题下写明）。
  - 「状态分布」卡片：六个状态各一行（图标 + 文字 + 数字 + 比例条）。
  - 项目卡片底部加状态分布条（按数量切段、0 不画、段间 2px 空隙，悬停看各状态数）和「N 未结 · N 已验收 · 待回答 · 被阻塞」。
  - 纯函数在 `features/dashboard/metrics.ts`（窗口合计、环比、纵轴取偶数上限、按项目求和），单测 `test/metrics.test.ts`。
  - 统计 60 秒刷新一次；新建的项目在刷新前先显示任务序号数。

### 项目详情页：统计卡片
- `/api/v1/stats` 加可选参数 `project=KEY`：只统计该项目（计数与 `daily` 都只算它）；看不到 / 不存在的项目 404（作用域同 `bosun_project:get/1`）。eunit `stats overview` 与 ct `org_isolation` 补了对应断言。
- 四张卡片抽成 `features/dashboard/TaskStatCards.tsx`，总览页与项目页共用；「未结任务」「近 7 天完成」带 14 天小趋势（`Sparkline.tsx`：最近 7 天用与动态图同色的系列色、之前 7 天弱化灰，0 画 1px 底线，纵向刻度至少到 4，数字在 title / aria-label 里）。
- 项目页（`pages/ProjectTasksPage.tsx`）卡片放在页头和筛选条之间，看板 / 列表两种视图都有；统计按整个项目算，不跟筛选走。
- `api/tasks.ts` 的 `applyTask`（新建 / 编辑 / 迁移之后）顺带刷新统计（`refreshStats`），拖完卡片数字马上跟上，不等一分钟轮询；`useStats` 去掉 `keepPreviousData`，切项目时不会先显示上一个项目的数字。

### 任务详情页（`pages/TaskDetailPage.tsx`）
- 页头：面包屑（项目方块 + KEY，挂了 Epic 的还有 Epic 一级）；ID / Epic / 状态 / 优先级 / 被阻塞 / 有提问待回答几枚标签，迁移按钮在右；标题缩到 2xl；下面一行元信息（提出人头像 · 创建 / 更新时间 · 反馈数 · 提交数）。
- 左栏：描述、Epic 步骤、「动态」。
  - 步骤卡片顶部加进度小结（步骤数 / 已验收 / 进行中 / 已撤销 + 完成率条，完成率不含已撤销），列表 / 看板切换与「新建步骤」都放在卡片页眉。
  - 「动态」卡片用标签页：Feedback（带计数）/ 状态历史（带计数）；缺省打开 Feedback（没有反馈时打开状态历史）；「添加 Feedback」在页眉右侧。
- 右栏：「详情」属性列表（状态、优先级下拉、执行人、提出人、所属 Epic 下拉、Epic 进度、标签（徽标 + 输入框）、创建 / 更新时间），然后是关联、提交（完整 hash + 复制按钮）。编辑能力与以前相同。
- 新增 `components/Section.tsx`（页眉细分隔线 + 标题 + 计数 + 右侧操作）；描述、步骤、详情、关联、提交都用它。
- `features/status/HistoryTimeline.tsx` 改成活动流：头像连竖线，「谁 开始 / 完成 / 打回… 了任务：A → B · 时间」，备注灰底，提交与测试证据（`$ 命令`）缩进在下。
- `features/links/LinksCard.tsx` 套 Section，对端状态改成图标（悬停看文字）。
- 顺手修：`SoftChip` 的 primary 色调在暗色下文字用了 `primary-foreground`（接近底色，看不清「进行中」等），改成两种模式都用 `text-primary`；Feedback 条目的时间字号与 ID 对齐。

### BQL 查询页（`pages/QueryPage.tsx`）
- 页头：图标 + 标题（筛选器名或「BQL 查询」）+ 一句说明；筛选器页右侧「编辑」「删除」按钮（原来是两个无字图标）。
- 「查询」卡片：页眉有「已修改，未保存」标记、`Enter` 运行 / `Shift+Enter` 换行提示、「速查」开关；输入框带代码图标；语法错误用红色提示条显示在输入框下（等宽字体）；运行 / 保存按钮在下。输入法组字时按 Enter 不再触发运行。
- 速查改成分格（字段 / 运算 / 日期 / 取值 / 排序与写法），展开在卡片内灰底区域。
- 示例改成两三列的小卡片：中文说明 + 等宽的查询；当前正在跑的那条高亮。
- 「结果」：标题旁计数徽标 + 实际排序（后端返回的 `order`，如「优先级降序」「相关度降序」）+ 显示列菜单。查询有错时不显示空表，改为虚线框提示「改好后再运行」。
- `TaskTable` 底部在 0 条时显示「共 0 个任务」（原来是「0–0，共 0 个任务」）。

### 账户页（`pages/AccountPage.tsx`）
- 参照 dashboard 的设置页：左侧分区导航「个人资料 / 外观 / API Key」（写进 URL `?tab=`，API Key 旁显示有效 key 数）。
- 个人资料：横幅 + 大头像 + 名字 / 角色 / 邮箱；「个人资料」属性列表（显示名、邮箱、组织、角色）；「安全」里修改密码（文案按后端实际行为写：改完后别处登录的会话全部失效，当前浏览器换新会话）。
- 外观（新）：浅色 / 深色两张预览卡（高亮当前生效的）+ 是否跟随系统的说明行，固定了主题时给「改回跟随系统」。主题 store 的规则不变（与系统一致 = 跟随系统），只是把它显示出来；`hooks/use-theme.ts` 新增 `isFollowingSystem` / `getSystemMode` / `followSystem`，`test/theme.test.tsx` 补一例。
- API Key：三张统计卡片（有效 / 已撤销 / 有效 Key 最近使用）；「连接 MCP」两段可复制的配置（`claude mcp add …` 与 `.mcp.json`，地址取当前页面的 origin，写法与 README 一致）；key 表格：名字 + 前缀两行、权限显示为「只读 / 读写 / 管理」+「全部项目 / N 个项目」、状态圆点，操作收进「⋯」菜单（轮换 / 撤销）；没有 key 时给带按钮的空状态。

### 组织页（`pages/OrgPage.tsx`，仅管理员）
- 标题「组织与用户」+ 说明，右上「新建用户」。
- 四张统计卡片：用户（启用 / 停用）、管理员、近 7 天登录（占启用用户的比例）、Agent（近 7 天活跃数）。
- 「组织信息」属性列表：组织名（直接改，有改动才出「保存」，Enter 保存、Esc 还原，输入法组字时 Enter 不触发）、ID（可复制）、创建时间、我的身份。
- 「用户」：搜索（名字 / 邮箱）+ 全部 / 管理员 / 成员 / 已停用 筛选（带数量，前端过滤）；表格里头像 + 名字 + 邮箱两行、角色徽标、状态圆点、最近登录、加入时间，操作收进「⋯」（编辑 / 停用 / 重置密码，仍是原来的面板）。
- 「Agent」（新）：本组织里出现过的 Agent（`/api/v1/actors` 里 kind = agent）：名字、归属（Key 主人的显示名）、项目 / 工作区、首次出现、最近活跃（7 天内绿点）；没有时给配置提示。

### 数据导入导出页（`pages/DataPage.tsx`，仅管理员）
- 三张统计卡片：当前的项目数（含归档）、任务数（含 Epic 数）、筛选器数。
- 「导出」：分两列写明包含什么（项目、任务含历史与证据、Feedback 含作废版本、关联、筛选器、出现过的人 / Agent、序号计数器）和不包含什么（用户 / 会话 / API Key、组织本身、搜索索引），下载按钮，命令行一行可复制。
- 「导入」：
  - 拖放区（也可点击选择）；选中文件后先在浏览器里预检（`features/data/exportFile.ts`：JSON 合法、`format = bosun-export`、版本 1 / 2），不合格直接在文件卡片里报错、不上传；合格则显示文件大小、版本、导出时间和各类记录数（项目 / 任务 / Feedback / 筛选器 / 关联 / 人与 Agent）。上传用预检时解析好的内容，不再读第二遍。单测 `test/exportFile.test.ts` 3 例。
  - 合并 / 替换做成两张可选卡片，各带说明；选替换时卡片和按钮变红，确认框写明只清**本组织**、会写入多少项目 / 任务，并建议先导出备份。
  - 结果用成功提示条（含「搜索索引已重建」）。

**发现但没改（不属于这轮样式）：**
- ~~`scripts/export.sh` / `scripts/import.sh` 不带任何凭据~~ → 已修，见下节。
- ~~筛选器导入重复~~ → 已修，见「修复：筛选器导入不再重复」。

### 登录 / 注册页（`features/auth/AuthShell.tsx`、`pages/LoginPage.tsx`、`pages/RegisterPage.tsx`）
- 外壳改成 dashboard 的分栏登录页：左边品牌 + 表单 + 页脚，右上角可切主题（未登录也能选）；右边（≥ lg）渐变色产品介绍：标题、一块装饰用的看板缩略图（固定色、读屏跳过）、三条功能点（看板即状态机 / Agent 经 MCP 接入 / BQL 跨项目查询）。窄屏只留左边。注册页共用这个外壳。
- 登录表单：邮箱 / 密码输入框带图标、高 40px，密码可切换显示；忘记密码的提示（找管理员在「组织与用户」里重置——管理员的用户面板确实能设新密码）；登录中按钮转圈；「还没有组织？」分隔线 + 描边按钮「注册一个新组织」；表单级错误用带图标的提示条。标题与标签文字不变（`test/auth.test.tsx` 按「登录」「邮箱」「密码」定位）。
- 注册页（`pages/RegisterPage.tsx`，第二轮细化）：
  - 顶部两步进度「验证邮箱 → 创建组织」（完成的一步打勾）。
  - 第一步：邮箱框带图标，提示「15 分钟内有效」（与 `bosun_email_code` 的 TTL 一致）；发送中按钮转圈；「已有账号？」分隔线 + 「去登录」。
  - 第二步：验证码改成 6 格输入（底下仍是一个真输入框：标签、粘贴、`autocomplete=one-time-code` 都照常，只收数字）；「换个邮箱 · 重新发送」，重发有倒计时——发出后 60 秒（与后端 `RESEND_MS` 一致），被 429 拒绝时按返回的 `retry_after` 校准。
  - 字段分「组织信息」「管理员账号（邮箱）」两组，输入框带图标；密码可切换显示，下方 4 段强度条（`features/auth/passwordStrength.ts`，只是提示，服务端规则仍是至少 8 位；单测 `test/passwordStrength.test.ts` 2 例）。
  - 提示条（成功 / 警告 / 错误）都带图标；副标题缩短成一行，页名用现在的「组织与用户」。

### 修复：`scripts/export.sh` / `scripts/import.sh` 带上凭据

原来两个脚本不带任何凭据，而 `/api/v1/export`、`/api/v1/import` 只给组织管理员（导入还要 key 带 `manage`）：一律 401，且 `curl -sf` 不输出任何东西（exit 22）。release 里的 `bin/export.sh` / `bin/import.sh` 是同一份（rebar.config overlay），一起修了。

- 读环境变量 `BOSUN_API_KEY`（组织管理员的 API key），没有就提示去「账户 → API Key」建、exit 2。key 经标准输入的 curl 配置（`curl -K -`）传进去，不出现在命令行 / `ps` 里。
- 失败时打印 HTTP 状态 + 服务端错误信息并 exit 1；401 / 403 各附一句原因（key 无效或已撤销 / 不是管理员 / 导入缺 manage 权限）；连不上服务也单独报。
- 导出先写同目录临时文件（`mktemp out.json.XXXXXX`），成功才改名：失败不会生成或覆盖出一个装着错误 JSON 的输出文件。
- 导入先校验模式（只收 `merge` / `replace`，以前写错会被服务端当成 merge）和文件可读；成功时打印服务端返回的导入统计。
- README 新增「备份与迁移」一节（用法、范围、两种模式、退出码）；第 9 条由「整库」改成「按组织」（经 API 导出的范围本来就是 key 所属组织）。`/data` 页上显示的两条命令带上 `BOSUN_API_KEY=bsk_…` 和所需权限。
- 验证（临时实例，.13）：无 key（exit 2）、服务连不上、已撤销 key（401）、成员的 key（403）、失败时已有文件原样保留、管理员只读 key 导出成功 / 导入 403 缺 manage、模式写错 / 文件不存在（exit 2）、非 Bosun 文件（400 带服务端信息）、管理员 manage key 合并 / 替换导入成功。.14（FreeBSD）当时连不上，`mktemp` 模板写法与 `wc -c | tr -d` 按 BSD 兼容写，但没在 FreeBSD 上实跑。

### 修复：筛选器导入不再重复（`apps/bosun_core/src/bosun_backup.erl`）

原来组织作用域下导入时每个筛选器一律发新 id（文件里的 id 可能属于别的组织），所以同一份导出合并两次就多一份；replace 往返后 id 也变了，`?filter=fN` 书签失效。现在 `place_filters/4` 按序决定落点（只管组织作用域；系统作用域的整库还原照旧原样写）：

1. id 是本组织原有的筛选器（本组织的 id 集合在 replace 删数据**之前**取）→ 沿用原 id 覆盖：与项目 / 任务的「同 ID 覆盖」一致，replace 往返后 id 不变；
2. 否则，本组织里已有同名同查询的（merge 时；含本文件里排在前面的）→ 跳过；
3. 否则发新 id（别的组织的 id、别的实例来的 id 都不照搬，也不会覆盖别的组织的筛选器）。

- 导入结果里 `filters` 改为**实际写入**的条数（新建 + 覆盖；以前是文件里的条数），新增 `filters_skipped`（因同名同查询跳过的）。/data 页成功提示里带上跳过数，合并说明与「筛选器」卡片文案相应改了。
- 测试：`bosun_auth_tests` 新增「importing filters does not duplicate them」（合并两次不多、同 id 覆盖把改过的改回来、外来 id 同名同查询跳过 + 文件内重复只留一份、别的组织的 id 不碰、replace 沿用原 id）；`backup_scoped` 里原来断言「replace 后筛选器 id 变了」（旧行为）改为断言 id 不变。`rebar3 check` 通过（eunit 65、ct 7）。
- 临时实例上经 HTTP + 脚本实测：导出后合并两次、再 replace，始终是原来的 f1 / f2 两个。

### 项目看板第二轮（参照 dashboard 的 Kanban 工具条与快速添加）

- **看板工具条**（`features/board/BoardToolbar.tsx`，只在看板视图）：
  - 执行人：头像叠放（前 5 位按手上任务数排序，首字母 + 按名字散列的底色，Agent 右下角带小标，悬停看名字与任务数），点一下只看他的、可多选；更多的收进「+N」弹层（勾选列表）；「未领取」单独一个开关。
  - 优先级三档开关；「需要关注」= 被阻塞或有提问待回答（带数量）。
  - 列内排序：优先级 / 最近更新 / 最新创建 / 编号（记在 localStorage `bosun.board.sort`）。
  - 有筛选时显示「显示 x / y」和「清除」。
  - 执行人 / 优先级 / 需要关注写进 URL（`who` / `pri` / `attn`），改上面的状态 / 搜索筛选、切视图时原样带上；只在前端对已拉回的任务生效。
- **快速添加**：「新建」列的 + 或列底「新建任务」打开内联输入框，回车创建（只填标题，其余缺省），清空后可接着加；Esc 关；「更多选项…」带着已输入的标题打开完整的新建面板（`TaskFormDialog` 加了 `defaultTitle`）。Epic 详情页的步骤看板同样可以快速添加，建出来直接挂在这个 Epic 下。「新建」列折叠着时会先展开。
- **列菜单**（⋯）：新建任务（「新建」列）、只看这一列 / 显示全部列（改的是状态筛选）、折叠。未结的三列列头显示高优先级数（红色 ↑N）。
- 纯逻辑在 `features/board/rules.ts`（`compareTasks`、`matchesBoardFilter`、`readBoardFilter` / `writeBoardFilter`、`assigneesOf`），`test/board.test.ts` 加 4 例（排序、筛选含未领取、URL 往返含带逗号的名字、执行人排序）；前端共 40 例。
- 临时实例截图核对：工具条（10 个执行人，含 Agent）、筛选执行人 + 未领取 + 高优先级（暗）、只看 alice、列菜单（暗）、快速添加连续两条（第一条创建成功、列计数 53 → 54）。

### 项目列表第二轮（参照 dashboard 的 Tasks 表格：列头排序、分面筛选、行操作）

列表是服务端分页的，排序 / 分面只在前端做会只对当前页生效，所以先扩了后端。

- **后端 `bosun_task:list/2`**（REST `GET /api/v1/projects/:key/tasks`；新参数全是可选的，MCP `list_tasks` 等原调用方不受影响）：
  - `priority=high,medium`、`assignee=alice,~none`（`~none` = 未领取）、`attention=true`（被阻塞或最新有效反馈是提问；放在条件最后，先缩小范围再读链 / 反馈）。
  - `sort=field[:asc|desc]`，field ∈ id / title / status（按状态机顺序）/ priority / assignee（未领取排后）/ feedback / updated / created；缺省方向 id / priority / feedback / updated / created 降序，其余升序；同键按编号新在前。不给 sort 时顺序不变（最新在前，有 q 时按相关度）。先排序再分页。
  - 不认识的优先级 / 排序字段 / 方向回 400（`{invalid, priority | sort, …}`）。
  - eunit「task list facets and sort」（各分面、各排序字段与方向、排序 + 分页、400）；ct `rest_chain` 加了经 REST 的排序 / 分面 / 400。
- **后端 `bosun_stats`**：每个项目（及合计）多给 `by_assignee`（执行人 → 任务数）、`unassigned`、`by_priority`，列表的分面选项与计数用它。起初执行人选项取自 `/api/v1/actors`，实测发现只被派了任务、自己没操作过的人不在那里面（截图里只剩 david），改成从统计里取。eunit `stats overview` 补了断言。
- **前端**：
  - 列头（`TaskTable` 的 `Head`，shadcn data-table 的写法）：ID / 标题 / 状态 / 优先级 / 执行人 / 反馈 / 更新可排序，点开有 升序 / 降序 / 取消排序 / 隐藏此列；当前排序列显示方向箭头、`aria-sort`。排序写进 URL `sort=`。
  - 分面（`features/tasks/ListFacets.tsx`，接在「状态」后面）：执行人（可搜索；含「未领取」；选项与数字来自本项目统计）、优先级（带数字）、需要关注。与看板工具条共用 URL 参数 `who` / `pri` / `attn`——切视图时筛选跟着走（看板在前端筛、列表交给服务端）；分面一变回到第一页；筛选条的「重置」一并清掉分面。分面上的数字是全项目的，不随其他筛选联动。
  - 行末 ⋯ 菜单：打开 / 复制 ID / 优先级（单选子菜单，直接改）。BQL 查询页的结果表也有这个菜单（改完刷新查询结果），并支持列头「隐藏此列」；查询页不加列头排序（排序写在 BQL 的 ORDER BY 里）。
  - 反馈列改为左对齐（与可点的列头对齐）。
- 验证：`rebar3 check`（eunit 66、ct 7）；前端 40 例 + build；临时实例截图核对：按优先级排序、执行人 × 3（含未领取）+ 优先级 × 2 + 标题升序（暗，33 条）、执行人分面弹层（8 位执行人 + 未领取，带数字）、优先级分面（暗）、列头排序菜单、行菜单（明 / 暗）。

### 任务详情第二轮（参照 dashboard 任务详情：可编辑执行人、上下一个、合并动态流、内联评论框）

只动前端（执行人用现有的 PATCH `assignee`，空串 = 取消指派）。

- **执行人可改**（`features/tasks/AssigneePicker.tsx`）：详情卡片里点执行人弹出可搜索列表——候选 = 本项目里有任务的执行人（按任务数，来自 `/stats?project=` 的 `by_assignee`）+ 组织里出现过的人 / Agent；输入一个不在列表里的名字可「指派给『…』」（Agent 的名字常常还没出现过）；可「取消指派」。注意：后端改执行人不写状态历史，所以动态里看不到谁改过执行人。
- **页头**：迁移按钮旁加「上一个 / 下一个任务」（按编号；编号连续、任务不删，用项目的 `task_count` 判断末尾，悬停显示目标 ID）和 ⋯ 菜单（复制 ID / 复制链接 / 在看板中查看 / 打开所属 Epic）。
- **动态**加「全部」标签页并设为缺省（`features/status/ActivityFeed.tsx`）：状态变化与 Feedback 按时间先后交错，从上往下读；状态变化是一行系统消息，Feedback 是卡片（作废的仍折叠成一行，待回答的仍高亮）。为此 `HistoryTimeline` 拆出 `HistoryBody`、`FeedbackList` 导出 `FeedbackEntry`、`kinds.ts` 加 `openQuestionOf`（单测 1 例）。
- **内联评论框**（`features/feedback/FeedbackComposer.tsx`）：在「全部」「Feedback」两个标签页底部；类型缺省跟着线索走（有待回答的提问时缺省「回答」，用户手动选过就以手选为准）；Ctrl / ⌘ + Enter 发送；「Markdown 编辑器…」带着草稿和类型打开原来的完整面板（`FeedbackDialog` 加 `initialContent` / `initialKind`）。页眉的「添加 Feedback」改为「写 Feedback」：滚到当前标签页的输入框并聚焦；有待回答的提问时页眉旁有提示。
- 验证：前端 41 例 + build；临时实例截图核对：带提问的任务（全部动态 + 输入框缺省「回答」）、经输入框发出回答后提问不再高亮、带提交与测试证据的任务（暗）、执行人选择器（输入新名字）、经选择器指派后接口返回新执行人。

### BQL 查询页第二轮（智能输入框、结果概览、最近查询、导出 CSV）

- **后端 `bosun_bql:query/2`**：结果里多给 `facets`（`by_status` / `by_priority` / `by_project`），按**整个结果集**算、不受分页影响；`bosun_bql_tests` 补了断言。
- **BQL 输入框**改用 CodeMirror 6（`features/query/BqlEditor.tsx`；新依赖 `@codemirror/autocomplete`、`@codemirror/commands`，其余 CodeMirror 包原来就有）：
  - 语法高亮（关键字 / 字段 / 字符串 / 数字与相对日期 / 枚举值 / 运算符；明暗两套色与 Markdown 代码块一致）。
  - 按上下文补全（`features/query/bql.ts` 的 `completionContext`）：条件开头补字段（字段表取自后端 `/filters` 的 `fields`，带中文说明——速查里没写到的 assignee / blocked / epic 等也能补出来）；运算符后、`IN (` 里补该字段的值（状态 / 优先级 / 类型 / true·false / 项目 key / 人名 / 相对日期）；完整条件之后补 AND / OR / ORDER BY / IS [NOT] EMPTY；ORDER BY 之后补字段与 ASC / DESC。值含空白或中文时自动加引号。
  - Enter 运行（补全列表开着时是选中）、Shift + Enter 换行、Ctrl + Space 手动唤出、撤销 / 重做。
- **结果概览**（`features/query/ResultSummary.tsx`）：状态分布条 + 状态 / 优先级 / 项目（多于一个时）的计数，点一项 = 在当前查询上追加 `AND 字段 = 值` 并运行（`refineQuery`：加在 ORDER BY 之前、原条件含顶层 OR 时加括号、引号里的 or / order by 不算）。
- **最近运行**：与「试试这些」并列的标签页，记实际执行过的查询（含点示例、侧栏筛选器、打开带 q 的链接），去重、最新在前、最多 8 条，存 localStorage `bosun.query.recent`。
- **导出 CSV**：结果栏「导出 CSV」把当前查询的结果（单次上限 500，超出时提示）导成 CSV（RFC 4180 转义、BOM、15 列），文件名 `bosun-<筛选器名或 query>-<时间>.csv`。
- 测试：`test/bql.test.ts` 7 例（补全上下文、refineQuery、quoteValue、CSV 转义、最近查询）；前端共 48 例；`rebar3 check` 通过（eunit 66、ct 7）。
- 临时实例核对：高亮、IN ( 里补状态、assignee = 后补人名（暗）、完整条件后补连接词、点「高」追加条件后结果 86 → 27 且最近运行记了 2 条、导出 WEB 项目 19 条（20 行，带 BOM）。

### 账户页第二轮（我的工作、主题色、偏好）

只动前端。

- **个人资料 → 「我的工作」**（`features/account/MyWork.tsx`）：四个可点的数字——我负责的未结、我提出的未结、等我回答（我提的任务上有待回答的提问，非 0 时琥珀色）、近 30 天完成——加我负责的未结任务前 5 条（状态 / ID / 标题 / 优先级 / 更新时间）。全部是 BQL 查询（按显示名匹配 assignee / reporter，跨项目），点数字带着同一条查询去查询页。
- **「外观」改名「外观与偏好」**：
  - **主题色**（`hooks/use-accent.ts` + `styles/theme.css` 的 `[data-accent]` / `.dark[data-accent]`）：蓝 / 紫 / 绿 / 橙 / 玫红，明暗各一档；只换 `--primary` 一族（按钮、选中、侧栏高亮，以及用 primary 的「进行中」状态），其余状态色与图表色不变；存 localStorage `bosun.accent`，模块加载时就套到 `<html>`（`main.tsx` 引入），别的标签页改了会跟上；带一小块预览。
  - **偏好**（`features/account/PreferencesPanel.tsx`）：项目页默认视图、列表每页行数、看板列内排序——就是项目页平时随手记的那几项；为此把视图 / 排序的读写从 `ProjectTasksPage` 挪到共用的 `features/tasks/prefs.ts`，两边读写同一处。
- 验证：前端 48 例 + build；临时实例：四条「我的工作」查询经 API 都是 200（25 / 87 / 2 / 12），个人资料页、紫色主题色的外观与偏好（暗）、橙色主题色下的项目看板截图核对。

### 组织页第二轮（团队负载、负责未结、行内改角色 / 停用）

- **后端 `bosun_stats`**：每个项目与合计多给 `open_by_assignee`（只数 NEW / IN_PROGRESS / DONE 的执行人 → 任务数）和 `open_unassigned`；原来的 `by_assignee` 是全部任务数，不适合看负载。eunit `stats overview` 补了断言。
- **团队负载**卡片（`features/org/TeamLoad.tsx`，放在组织信息下面，dashboard 的 Team 卡片）：人和 Agent 按手上未结任务数从多到少（最多 8 行，其余汇总一行），横条按最多的那个归一，「未领取」放最后；每行点进去是该执行人未结任务的 BQL 查询（未领取用 `assignee IS EMPTY`；链接拼法在 `features/org/queries.ts`）。
- **用户表**加「负责未结」列（数字可点，同上）；行菜单（`features/org/UserRowMenu.tsx`）：编辑 / 重置密码…（原面板）、设为管理员 / 设为成员、停用（要确认，说明会被立刻登出、数据保留；自己那一行不给）/ 启用。后端「至少留一个启用的管理员」的 409 `last_admin` 翻成中文提示。
- **Agent 表**加「负责未结」列。
- 验证：`rebar3 check`（eunit 66、ct 7）；前端 48 例 + build；临时实例：`assignee IS EMPTY …` 查询 200；页面（明）、bob 的行菜单（暗）、把唯一的管理员 david 设为成员被拒（提示「组织里至少要留一个启用的管理员」，接口确认仍是 admin）、经行菜单把 bob 设为管理员（接口确认 role = admin）。

### 数据导入导出第二轮（导入预演）

- **后端 `bosun_backup:import/2` 加 `dry_run`**（REST `POST /api/v1/import?mode=…&dry_run=true`）：所有检查与落点规则照常走完（含项目 key 被别的组织占用、引用不存在的项目等），在事务末尾回滚；不写库、不重建索引，也不消耗筛选器 id 计数器（它是脏写、回滚不掉，所以预演给新筛选器的是占位 id，`place_filters/5` 多了取 id 的函数参数）。返回 `detail`：项目 / 任务 / Feedback / 筛选器各自的 新增 / 覆盖（筛选器另有 跳过）、关联条数，replace 时另给将删除的条数（删之前数；组织作用域只数本组织）。正式导入的返回也带同样的 `detail`（原有字段不变）。
  - eunit「import dry run previews without writing」：合并 / 替换预演的各项数字、预演后任务数与筛选器不变、筛选器 id 计数器没被消耗、冲突照样报错。
- **前端**（`features/data/ImportPlan.tsx`）：选好合格的文件、或切换合并 / 替换时自动预演，结果做成表（新增绿、覆盖琥珀、删除红、跳过灰）；replace 有「将删除」列和红色提示；预演失败（翻成中文、保留原文）时「导入」按钮不可用；导入完成后同一张表显示实际写入的结果。预演结果按「哪个文件 + 哪种模式」对应，快速切换时旧的响应不会盖掉新的。
- 验证：`rebar3 check`（eunit 67、ct 7）；前端 48 例 + build；临时实例：在真实导出上加 1 个任务、1 个筛选器的文件——合并预览（覆盖 3 / 85 / 3 / 1，新增任务 +1、筛选器 +1）、替换预览（暗，将删除 3 / 85 / 3 / 1）、项目 key 被另一组织占用的文件（预演报错、导入按钮禁用）、正式合并后结果表与接口一致（任务 +1、筛选器 2 个不重复）。

### 登录页第二轮（记住邮箱、大写锁定、限流倒计时、来意提示）

只动前端（`pages/LoginPage.tsx`，另改了 `layouts/MainLayout.tsx` 的退出跳转）。

- **记住邮箱**：勾选后登录成功时把邮箱存 localStorage `bosun.login.email`（只存邮箱，不存密码），下次自动填好并把焦点放在密码框；取消勾选立刻删掉。
- **大写锁定提示**：在密码框里按键时检测 Caps Lock，打开时在框下提示（`aria-describedby` 关联）。
- **限流倒计时**：登录被 429 时按服务端的 `retry_after` 倒数，按钮显示「N 秒后可再试」（一分钟以上用 分:秒，登录锁定常是 15 分钟）并禁用，到点自动恢复。
- **来意提示**：带 `?next=` 进来时说明「需要先登录，登录后回到 /…」；退出登录现在跳 `/login?signedout=1`，显示「已退出登录」。
- 输入框改了内容就清掉该字段的错误提示。
- 测试：`test/auth.test.tsx` 加 6 例（记住 / 忘记邮箱、登录成功后记住、429 倒计时、长锁定显示分:秒、next 提示 + 大写锁定、退出提示）；Radix Checkbox 在 jsdom 里要 `ResizeObserver`，`test/setup.ts` 加了空实现。前端共 54 例。
- 临时实例：带 next 的登录页、退出后（暗，邮箱已记住）、连续 10 次错密码后服务端回 429，页面显示限流提示与「14:04 后可再试」。

### 外壳与样式
- `layouts/MainLayout.tsx`：侧栏 w-64，品牌块（图标 + 组织名）、「工作区 / 项目 / 筛选器 / 管理」分组，项目前加按 key 着色的首字母方块（`components/ProjectMark.tsx`），用户菜单移到侧栏底部；页眉改为 h-14，左侧显示当前位置，右侧全局搜索 + 主题切换。
- `styles/theme.css`：侧栏用比内容区略灰一档的 `--sidebar*` 色（明 / 暗各一套）。
- `features/tasks/StatusIcon.tsx`：状态 / 优先级图标（色值在 `status.ts`），表格的状态、优先级列改为图标 + 文字。
- 项目卡片页：首字母方块、任务数、更新时间，悬停阴影。
- `components/ui/sheet.tsx` 加 `showCloseButton`；`SidePanel` 关掉自带的那个，修掉面板右上角两个 × 叠在一起的问题。

## 验证
- `corepack pnpm typecheck / lint / test / build` 通过（lint 只剩原有 3 条 fast-refresh 警告；新增 `test/board.test.ts` 2 例、`test/columns.test.ts` 5 例、`test/metrics.test.ts` 4 例、`test/theme.test.tsx` 1 例、`test/exportFile.test.ts` 3 例、`test/passwordStrength.test.ts` 2 例，共 36 例）；后端 `rebar3 check` 通过（xref + dialyzer + eunit 64 + ct 7）。
- 临时实例（独立数据目录 + 演示数据）+ headless Chrome CDP 截图核对：明 / 暗两套看板、拖动中、拖到「进行中」直接迁移、拖到「已完成」弹完成证据面板、拖到折叠列弹说明面板、列表视图、Epic 详情、项目卡片页；列表分页（62 条、每页 10、第 6 页）与「显示列」菜单（深色）；项目列表页明 / 暗两套（任务时间在临时库里按天错开，看动态图形状）与图表悬停提示；项目详情页（看板 / 列表，明 / 暗）；任务详情页（Epic、带提问的任务、带提交与测试证据的任务及其状态历史，明 / 暗）；BQL 查询页（查询 + 速查、已存筛选器（暗）、语法错误）；账户页（个人资料、API Key（暗，含已撤销 key）、外观）；组织页（5 个用户含 1 个停用、3 个 Agent，明 / 暗；Agent 在临时节点上用 rpc 调 `bosun_actor:touch/3` 造的）；数据导入导出页（空状态、选中合法文件 + 替换模式、非 Bosun 文件（暗）、合并导入成功）；登录页（明 / 暗、密码错误、390px 手机宽度）与注册页（第一步、第二步填写中、在浏览器里走完整个注册——验证码从临时实例日志里读——落到新组织的空总览，之后用新账号登录回 200）。
- 没在真机上用触屏试过长按拖动。
