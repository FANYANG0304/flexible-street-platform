# 组会汇报 · FSI 模型改动
# Group Meeting · FSI Model Updates

**2026-04-24**

---

## 一、打分方式改了：从"画个圆"变成"看这条街本身"
## 1. Scoring method: from "circle around the center" to "along the street itself"

**中文**
以前的打分方式是：选出街道中点，画一个圆，圆里的 POI 都算这条街的分。结果隔壁街的餐馆也算进来了，这条街"被借光"变高分。
现在改成：只看真正沿着这条街、面对这条街路边的 POI。隔壁街的不算。

**English**
The old method picked the center of a street and drew a circle around it — any POI inside counted toward the score. This meant restaurants on the parallel block were also credited to this street. Now the method only counts POIs that sit right along the street's curb face. Parallel-block POIs are excluded.

---

## 二、不同类型 POI 用不同的"范围"
## 2. Different POI types get different "reach"

**中文**
不是所有 POI 服务街道的半径都一样。分三种处理：

| 类型 | 范围 | 原因 |
|---|---|---|
| 商业（餐饮/文化/金融） | 35 米 | 餐馆必须就在这条街面上，隔街的不吸引本街人流 |
| 社区（学校/教堂/医院/社区中心） | 150 米 | 家长走 1–2 个街区送孩子到学校，这种"走得到"的范围更大 |
| 交通（公交/地铁站）| 80 米 | 稍远一点也能走到 |

**English**
Different POI types serve a street at different distances:

| Type | Range | Why |
|---|---|---|
| Commercial (food / culture / finance) | 35 m | Restaurants must actually front the block; parallel-street ones don't pull foot traffic here |
| Community (schools / churches / healthcare / community centers) | 150 m | Parents walk kids 1–2 blocks to school; the "walkable" radius is wider |
| Transit (bus / rail stops) | 80 m | Transit is still considered accessible a bit further away |

---

## 三、把原来的 "Social" 拆成两部分
## 3. Split the old "Social" into two parts

**中文**
原来 Social 把学校、教堂、医疗、公交站都混在一起算一个分，看不出到底是哪类在撑高这条街。
现在拆开：
- **Community**（学校/社区机构/医院/宗教场所/公共安全）→ 参与最终分数
- **Mobility**（交通站点）→ **只显示，不算进最终分数**。好的交通是活化的前提条件，但不是"必须关闭这条街"的理由。

**English**
The old "Social" category lumped schools, churches, healthcare, and transit into one score, making it unclear which type was driving the rating. Now split into:
- **Community** (schools / community orgs / healthcare / religious / safety) → counts toward the final score
- **Mobility** (transit stops) → **shown for context only, does not affect the final score**. Good transit is a prerequisite for car-free activation, but transit access alone isn't a reason to close a street.

---

## 四、Education 标签按学段细分
## 4. Broke Education tag into age groups

**中文**
（按老师建议）把 Education 类 POI 按服务对象拆成四个子标签：**Pre-K/托育**、**K-12 学校**、**大学**、**图书馆**。只改显示，不改算分逻辑。用户点开详情能看到这条街附近具体有几所什么类型的教育设施。

**English**
Per advisor's suggestion, broke Education POIs into four display sub-tags: **Pre-K / daycare**, **K-12 schools**, **higher education**, **libraries**. Display-only — the underlying community score is unchanged. Users can now see exactly which kind of education facility is near the street.

---

## 五、归属（谁管这条街）不再扣分
## 5. Street ownership no longer affects the score

**中文**
原来的逻辑：如果街道是州政府或私人拥有，分数直接清零；如果是 SEPTA/DRPA 这类需要协调的机构，打 7.5 折。
问题是这把"街道本身活化潜力"和"审批流程能不能通过"混在一起了。
现在改成：归属只作为**警告标签**显示，分数照常反映街道的物理活化潜力。能不能真落地由用户自己判断。

**English**
The old logic zeroed the score for state / privately-owned streets and applied a 25% penalty for SEPTA / DRPA-managed streets. This mixed "activation potential" with "approval feasibility" into one number. Now ownership is shown only as a **warning tag**; the score cleanly reflects physical activation potential, and the user decides whether jurisdictional friction is worth the trouble.

---

## 六、活动只算"节庆类"，不算普通演唱会/球赛
## 6. Only seasonal events count — not regular concerts or games

**中文**
原来的逻辑：Ticketmaster 上附近有任何活动都给街道加分，包括平时的演唱会、篮球赛。
现在只算**节庆/季节性活动**：游行、马拉松、Mummers、Penn Relays、Made in America、开放街道等——这些才是真正带动街道人流的。

**English**
The old rule boosted any Ticketmaster event nearby, including routine concerts and ball games. Now only **seasonal / festival events** count: parades, marathons, Mummers, Penn Relays, Made in America, open-street days — the events that actually drive street-level foot traffic.

---

## 七、用 playstreet 和 Open Streets 反推参数（而不是拍脑袋）
## 7. Used playstreets and Open Streets to derive parameters (instead of guessing)

**中文**
原来的打分灵敏度（saturation 参数）是凭感觉设的。
现在写了一个校准工具：
- 用 **playstreet**（已经被社区选做活化的居民街）作为 community 维度的"正样本"，反推 community 参数
- 用 **Open Streets**（Center City 的商业街活化）作为 commercial 维度的"正样本"，反推 commercial 参数

**得到的新参数：**
- Community：3.0 → **0.6**
- Commercial：2.0 → **6.5**（原来太松，所有商业街都顶到满分，没层次）

**结果：**
- 与 playstreet / Open Streets 的**重合验证率从 3% 提升到 32%**（约 10 倍）

**English**
The old sensitivity parameters were hand-picked. I built a calibration tool that:
- Uses **playstreets** (residential blocks already chosen for activation) as the community-dimension ground truth
- Uses **Open Streets** (Center City commercial activations) as the commercial-dimension ground truth

**New parameters:**
- Community: 3.0 → **0.6**
- Commercial: 2.0 → **6.5** (old value was too lenient — every commercial street hit 100, losing discrimination)

**Result:**
- **Validation pass rate jumped from 3% to 32%** — roughly 10×.

---

## 八、新增"本地领先"加分
## 8. Added a "local leader" bonus

**中文**
观察：如果一条街在周围稀疏社区里是唯一有几家餐馆/商铺的——就算绝对数量不多，它也应该是这个社区的活化锚点。原来的算法只看绝对密度，这种"本地冠军"被淹没在同样的红色里。
现在：每条街和周围约 400 米内的其他街比较，如果明显领先，给额外最多 +40 分（商业）/ +10 分（社区）。低于邻居平均的不扣分。

**English**
Observation: a street that is the only one in its sparse neighborhood with a handful of restaurants — even if the absolute count is modest — should still be the activation anchor for that area. The old algorithm only measured absolute density, so "local leaders" drowned in the same red as their neighbors.
New logic: each street is compared to others within ~400 m. Clear local leaders get a bonus of up to +40 (commercial) / +10 (community). Below-average streets are not penalized.

---

## 九、验证阈值从 90 降到 75
## 9. Validation threshold lowered from 90 to 75

**中文**
原来只有"Excellent"(≥90) 算达标。太严。
改成 75 — 对应图例里的"Good"档及以上，这才是实际能推荐的合理门槛。

**English**
The old threshold counted only "Excellent" (≥90) as validated — too strict. Lowered to 75, which corresponds to the "Good or better" band in the legend and is the realistic floor for recommending activation.

---

## 十、修了一堆地图显示 bug
## 10. Fixed a batch of map display bugs

**中文**
- **同一条街在不同缩放下颜色不一致**（放大黄、缩小绿，放回来又黄）：根因是 Mapbox 在每个缩放级别独立编号街道，feature 颜色数据在不同缩放间错位。修复：给街道一个全局稳定 ID。
- **颜色档位混乱**：原来是颜色平滑渐变，86 分渲染成"黄绿混色"。现在严格按图例分档：0-49 红、50-74 橙、75-89 黄、90+ 绿。
- **点一下街道颜色突变**：原来的 race condition——不同代码路径算分用的不是同一个数据点。现在统一：**第一次确定，之后不再变**。
- **勾选分数层时底下归属色透出来**：自动隐藏 centerline 层避免混色。
- **标签颜色和图例不一致**：66 分原来显示成绿色 pill，但图例里 50-74 是橙色 Fair。修正为按图例档位上色。

**English**
- **Same street, different color at different zooms** (yellow when zoomed in, green when zoomed out, etc.): the root cause was Mapbox assigning independent per-zoom feature IDs, so color data written at one zoom didn't apply at another. Fixed by promoting a global-stable ID.
- **Color banding confusion**: the old line color was a smooth gradient, so a score of 86 rendered as yellow-green mix. Now discrete bands strictly matching the legend: 0-49 red, 50-74 orange, 75-89 yellow, 90+ green.
- **"Click a street, color suddenly jumps"**: race condition where different code paths computed scores from different anchor points. Now unified: **first touch wins, never re-computed**.
- **Ownership color bleeding through the score layer**: centerline layer now auto-hides when the score layer is on.
- **Tag color didn't match legend**: a score of 66 was previously shown as a green "positive" pill, but the legend calls 50-74 "Fair" (orange). Now pill colors follow the legend bands exactly.

---

## 十一、新增的 UI 小功能
## 11. Small new UI features

**中文**
- **一键筛选"只看可封闭街道"**：隐藏州管、私有、机场这类不能关闭的街道
- **标签可点开查看解释**：详情面板里每个 factor tag 点一下就展开对应的打分说明

**English**
- **One-click "closeable streets only" filter**: hides state / private / airport streets that can't actually be closed
- **Clickable tags with explanations**: every factor tag in the detail panel expands on click to reveal what it means and how it contributes to the score

---

## 总结 / Summary

**中文**
今天的核心工作是把 FSI 模型从"凭感觉设半径、凭感觉调参数"推进到"方法论对齐真实街道逻辑、参数用 Philly 真实活化案例反推"。最主要的指标提升：**与 playstreet / Open Streets 的重合率 3% → 32%**。其余工作是让界面和新模型对齐，并修掉一批因为代码路径不统一导致的视觉 bug。

**English**
Today's core work moved the FSI model from "hand-picked radii, hand-tuned parameters" to "methodology aligned with how streets actually work, parameters derived from Philly's real activation cases." Headline metric: **validation overlap with playstreets / Open Streets went from 3% to 32%**. The rest was UI alignment with the new model plus a batch of fixes for visual bugs caused by inconsistent code paths.
