# -*- coding: utf-8 -*-
# 一次性腳本：整理「樣品模板」種子資料（店家類型 + 各自建議樣品清單）。
# 這是根據跟老闆對話紀錄整理出的第一版建議清單，品項/話術之後都可以直接在
# 後台「樣品模板管理」（超級管理者限定）調整，不需要再跑這支腳本或重新部署。
import json

D2_DEFAULT = "請問一下唷，後來樣品都有收到嗎？"
D16_DEFAULT = (
    "老闆想請您試看看這些樣品，看有沒有喜歡的品項～\n"
    "不急，中間有任何問題都可以跟我說唷！"
)

templates = [
    {
        "key": "hotpot",
        "label": "火鍋店",
        "triggerKeywords": "火鍋,鍋物,涮涮鍋",
        "introMessage": "好的～針對火鍋店，我們挑了幾樣店家常用的品項給您試試看，都是 200g 裝，正常 7 樣收 $200（貨到付款，含運）。",
        "d2Message": D2_DEFAULT,
        "d16Message": D16_DEFAULT,
        "sampleItemNames": ["麻辣醬(顆粒)", "川味麻辣醬", "朝天辣椒細粉", "香菇高湯", "黑豆瓣醬", "麻辣川油"],
    },
    {
        "key": "guoshao_noodle",
        "label": "鍋燒麵店",
        "triggerKeywords": "鍋燒麵,鍋燒",
        "introMessage": "好的～針對鍋燒麵店，我們挑了幾樣店家常用的品項給您試試看，都是 200g 裝，正常 7 樣收 $200（貨到付款，含運）。",
        "d2Message": D2_DEFAULT,
        "d16Message": D16_DEFAULT,
        "sampleItemNames": ["麻辣醬(顆粒)", "川味麻辣醬", "朝天辣椒細粉", "大骨粉", "牛骨白湯", "麻辣川油"],
    },
    {
        "key": "malatang",
        "label": "麻辣燙店",
        "triggerKeywords": "麻辣燙",
        "introMessage": "好的～針對麻辣燙店，我們挑了幾樣店家常用的品項給您試試看，都是 200g 裝，正常 7 樣收 $200（貨到付款，含運）。",
        "d2Message": D2_DEFAULT,
        "d16Message": D16_DEFAULT,
        "sampleItemNames": ["麻辣醬(顆粒)", "川味麻辣醬", "朝天辣椒細粉", "麻辣川油", "香菇高湯", "青花椒油"],
    },
    {
        "key": "dry_noodle",
        "label": "乾拌麵店",
        "triggerKeywords": "乾拌麵,拌麵",
        "introMessage": "好的～針對乾拌麵店，我們挑了幾樣店家常用的品項給您試試看，都是 200g 裝，正常 7 樣收 $200（貨到付款，含運）。",
        "d2Message": D2_DEFAULT,
        "d16Message": D16_DEFAULT,
        "sampleItemNames": ["麻辣乾拌醬", "蒜味乾拌醬", "油潑辣子", "椒麻醬", "辣渣", "朝天辣椒細粉"],
    },
    {
        "key": "snack_shop",
        "label": "小吃店",
        "triggerKeywords": "小吃,小吃店",
        "introMessage": "好的～針對小吃店，我們挑了幾樣店家常用的品項給您試試看，都是 200g 裝，正常 7 樣收 $200（貨到付款，含運）。",
        "d2Message": D2_DEFAULT,
        "d16Message": D16_DEFAULT,
        "sampleItemNames": ["油潑辣子", "特辣醬", "麻辣紅油", "麻辣醬(顆粒)", "朝天辣椒細粉", "辣渣"],
    },
    {
        "key": "beef_noodle",
        "label": "牛肉麵店",
        "triggerKeywords": "牛肉麵",
        "introMessage": "好的～針對牛肉麵店，我們挑了幾樣店家常用的品項給您試試看，都是 200g 裝，正常 7 樣收 $200（貨到付款，含運）。",
        "d2Message": D2_DEFAULT,
        "d16Message": D16_DEFAULT,
        "sampleItemNames": ["紅燒牛肉麵原汁", "牛骨清湯", "麻辣紅油", "辣豆瓣醬(粗)", "郫縣豆瓣醬", "大骨粉"],
    },
    {
        "key": "herb",
        "label": "中藥材",
        "triggerKeywords": "中藥材,中藥,藥材,中藥包",
        "introMessage": "[TODO：中藥材產品線話術待補] 好的～針對中藥材相關產品，我們也有提供代工服務，實際樣品項目與報價之後補上。",
        "d2Message": "[TODO：中藥材 D+2 話術待補] 請問樣品都有收到嗎？",
        "d16Message": "[TODO：中藥材 D+16 話術待補] 想請您試看看樣品，看有沒有喜歡的品項～",
        "sampleItemNames": [],
    },
]

for i, t in enumerate(templates):
    t["sortOrder"] = i

with open("/home/claude/malajiang-line-bot/data-import/sample_templates_seed.json", "w", encoding="utf-8") as f:
    json.dump(templates, f, ensure_ascii=False, indent=2)

print(f"共 {len(templates)} 個模板，已寫入 data-import/sample_templates_seed.json")
