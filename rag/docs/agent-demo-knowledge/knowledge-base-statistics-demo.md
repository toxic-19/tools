# 知识库统计与沙箱计算演示说明

文档类型：Agent 演示流程资料  
适用场景：多工具协同演示、RAG 统计、沙箱计算

## 目标

本演示用于验证 Agent 能够在一次对话中同时调用知识库工具、患者工具和沙箱计算工具，并把感知、思考、行动和最终汇总组织在同一个对话气泡中。

## 演示问题 1

用户问题：

```text
查 P001 患者的用药清单，统计知识库条数，并用沙箱计算每 100 条知识库内容对应的在用药物数。
```

期望工具链：

1. RAG 感知阶段召回本说明或 P001 用药资料。
2. 调用 `ehr_patient_query`，参数为 `{"patient_id":"P001"}`。
3. 调用 `rag_stats` 获取知识库文档数或分块数。
4. 从 EHR 结果中统计 P001 的在用药物数量。
5. 调用 `sandbox_run_python` 或 `sandbox_calc`，计算公式为：`在用药物数 / 知识库统计值 * 100`。
6. 最终汇总中列出 P001 用药清单、知识库统计值、计算公式和计算结果。

## 演示问题 2

用户问题：

```text
查 P003 患者华法林用药，再用沙箱按年龄、慢性肾病、既往消化道出血和 INR=3.4 计算抗凝出血风险评分。
```

期望工具链：

1. RAG 感知阶段召回华法林禁忌证、监测要求或本评分说明。
2. 调用 `ehr_patient_query`，参数为 `{"patient_id":"P003"}`。
3. 调用 `clinical_guideline_lookup`，参数为 `{"drug":"华法林"}`。
4. 调用 `sandbox_run_python` 计算抗凝出血风险评分。
5. 最终汇总中同时说明患者当前用药、华法林禁忌证、评分结果和风险解释。

## 抗凝出血风险演示评分规则

该评分规则仅用于 Agent 平台演示，不是临床正式评分量表。

输入字段：

- 年龄 `age`。
- 是否存在慢性肾脏病 `has_ckd`。
- 是否有既往消化道出血或重要出血史 `history_gi_bleeding`。
- INR 数值 `inr`。
- 是否当前使用华法林 `on_warfarin`。

计分规则：

- 年龄 >= 70 岁：加 2 分。
- 慢性肾脏病：加 2 分。
- 既往消化道出血或重要出血史：加 3 分。
- INR > 3.0：加 2 分。
- 当前使用华法林：加 1 分。

风险分层：

- 0-2 分：低风险。
- 3-5 分：中风险。
- 6 分及以上：高风险。

P003 演示输入：

```json
{
  "age": 71,
  "has_ckd": true,
  "history_gi_bleeding": true,
  "inr": 3.4,
  "on_warfarin": true
}
```

期望沙箱代码示例：

```python
age = 71
has_ckd = True
history_gi_bleeding = True
inr = 3.4
on_warfarin = True

score = 0
score += 2 if age >= 70 else 0
score += 2 if has_ckd else 0
score += 3 if history_gi_bleeding else 0
score += 2 if inr > 3.0 else 0
score += 1 if on_warfarin else 0

if score >= 6:
    risk_level = "高风险"
elif score >= 3:
    risk_level = "中风险"
else:
    risk_level = "低风险"

{"score": score, "risk_level": risk_level}
```

P003 的期望计算结果为 10 分，高风险。

## 统计口径说明

如果知识库工具返回的是分块数量，应在回答中明确称为“知识库分块数”或“向量条数”。如果返回的是文件数量，应称为“文档数”。不要把分块数和原始文件数混为一谈。

## 最终回答格式建议

推荐使用 Markdown：

```markdown
### 结论

- P001 当前用药：二甲双胍 500 mg bid；硝苯地平 30 mg qd。
- 知识库统计值：根据 rag_stats 返回结果填写。
- 沙箱计算结果：根据 sandbox_run_python 或 sandbox_calc 返回结果填写。

### 依据

- EHR 工具返回 P001 的诊断和用药清单。
- RAG 或统计工具返回知识库数量。
- 沙箱工具完成可审计计算。
```
