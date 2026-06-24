# Agent 平台演示知识库文档

本目录提供一组与 Agent 平台演示用例对齐的 Markdown 文档，可上传到向量数据库用于 RAG 召回。

建议上传顺序：

1. `warfarin-anticoagulation-guide.md`
2. `metformin-diabetes-guide.md`
3. `nifedipine-hypertension-guide.md`
4. `patient-medication-safety-demo.md`
5. `knowledge-base-statistics-demo.md`

覆盖演示问题：

- 查 P003 患者用药，看一下华法林的禁忌症。
- 查 P001 患者在用二甲双胍，这个药的禁忌人群是什么，同时给出知识库一共有多少条文档。
- 查 P001 患者的用药清单，统计知识库条数，并用沙箱计算每 100 条知识库内容对应的在用药物数。
- 查 P003 患者华法林用药，再用沙箱按年龄、慢性肾病、既往消化道出血和 INR=3.4 计算抗凝出血风险评分。

这些文档仅用于演示 RAG、Mock EHR、Mock 指南查询和沙箱工具协同，不构成真实医疗建议。
