"""生成文档附件测试用的样例文件（需要 python-docx、openpyxl、python-pptx、reportlab，PDF 另需 LibreOffice）。

    python3 tests/fixtures/make-fixtures.py
"""
import os
import shutil
import subprocess
import tempfile

from docx import Document
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))

# Word：标题、段落、列表、表格
doc = Document()
doc.add_heading('课程设计要求', level=1)
doc.add_paragraph('请用 Vue 3 实现一个“图书管理”网页，截止日期：12 月 20 日。')
doc.add_paragraph('支持增删改查', style='List Bullet')
doc.add_paragraph('数据保存在 localStorage', style='List Bullet')
table = doc.add_table(rows=2, cols=2)
table.cell(0, 0).text = '评分项'
table.cell(0, 1).text = '分值'
table.cell(1, 0).text = '功能完整'
table.cell(1, 1).text = '60'
doc.save(os.path.join(HERE, 'sample.docx'))

# Excel：两个工作表、数字、公式结果、含逗号的文字
wb = Workbook()
ws = wb.active
ws.title = '成绩'
ws.append(['姓名', '分数', '备注'])
ws.append(['张三', 92, '优秀, 继续保持'])
ws.append(['李四', 78.5, None])
ws2 = wb.create_sheet('统计')
ws2['A1'] = '平均分'
ws2['B1'] = 85.25
wb.save(os.path.join(HERE, 'sample.xlsx'))

# PowerPoint：两页，带备注
prs = Presentation()
s1 = prs.slides.add_slide(prs.slide_layouts[1])
s1.shapes.title.text = '项目汇报'
s1.placeholders[1].text = '第一部分：需求分析'
s1.notes_slide.notes_text_frame.text = '这里讲五分钟'
s2 = prs.slides.add_slide(prs.slide_layouts[5])
s2.shapes.title.text = '总结与展望'
box = s2.shapes.add_textbox(Inches(1), Inches(2), Inches(6), Inches(1))
box.text_frame.text = '感谢聆听'
prs.save(os.path.join(HERE, 'sample.pptx'))

# PDF 1：reportlab 内置中文 CID 字体（提取文字需要 CMap）
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
c = canvas.Canvas(os.path.join(HERE, 'sample-cid.pdf'))
c.setFont('STSong-Light', 14)
c.drawString(72, 760, '实验报告：二分查找')
c.drawString(72, 736, '时间复杂度为 O(log n)。')
c.showPage()
c.setFont('STSong-Light', 14)
c.drawString(72, 760, '第二页：结论')
c.save()

# PDF 3：只有图形没有文字（模拟扫描件）
c = canvas.Canvas(os.path.join(HERE, 'sample-scan.pdf'))
c.setFillColorRGB(0.3, 0.5, 0.8)
c.rect(72, 600, 300, 150, fill=1)
c.save()

# PDF 2：用 LibreOffice 把上面的 Word 导出为 PDF（嵌入字体子集）
if shutil.which('soffice'):
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, os.path.join(HERE, 'sample.docx')], check=True, capture_output=True)
        shutil.copy(os.path.join(tmp, 'sample.pdf'), os.path.join(HERE, 'sample-office.pdf'))
print('ok')
