import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, CustomerStatus } from '@prisma/client';

/**
 * 客户档案表 (Customer Archive Form) XLSX 导出。
 *
 * 输出严格按线下模板布局（参考蓝电锂能客户档案表 LD-SM-FM-001/A0）：
 *
 *   行 1-2: 公司中英文抬头（合并 C:J）+ 表单编号（合并 K:M，右对齐）
 *   行 3:   "客户档案表" 大标题（合并 A:M，居中）
 *   行 4:   空行（视觉留白）
 *   行 5:   分组表头（"客户联系人" 合并 E:H、"客户产品" I:J、"财务状况" K:L；
 *           "序号"/"客户编号"/"客户名称"/"客户地址"/"其他信息" 与下一行纵向合并）
 *   行 6:   子表头（姓名/职务/电话/邮箱、型号/应用市场、付款方式/信用额度）
 *   行 7+:  数据行；财务状况两列与"其他信息"列按业务约定留空，由销售线下补充
 */
@Injectable()
export class CustomersExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 把符合 `where` 条件的客户写成"客户档案表"格式的 xlsx 并直接流到响应。
   * 在控制器里组装好 where（含权限过滤 + 状态过滤）后调用即可。
   */
  async streamArchiveXlsx(
    res: Response,
    where: Prisma.CustomerWhereInput,
    statusLabel: string,
  ) {
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: [{ customerCode: 'asc' }, { createdAt: 'asc' }],
      include: {
        // 模板每个客户一行 → 取首要联系人；若没有 isPrimary 则退到第一条
        contacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 1,
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '蓝电锂能 CRM';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('客户档案表', {
      views: [{ state: 'frozen', ySplit: 6 }], // 滚动时表头始终可见
    });

    // ===== 列宽 =====
    sheet.columns = [
      { key: 'no', width: 6 },         // A 序号
      { key: 'code', width: 14 },      // B 客户编号
      { key: 'name', width: 30 },      // C 客户名称
      { key: 'addr', width: 35 },      // D 客户地址
      { key: 'cName', width: 12 },     // E 姓名
      { key: 'cTitle', width: 12 },    // F 职务
      { key: 'cPhone', width: 18 },    // G 电话
      { key: 'cEmail', width: 26 },    // H 邮箱
      { key: 'model', width: 22 },     // I 型号
      { key: 'market', width: 14 },    // J 应用市场
      { key: 'pay', width: 14 },       // K 付款方式
      { key: 'credit', width: 14 },    // L 信用额度
      { key: 'other', width: 20 },     // M 其他信息
    ];

    // ===== 行 1-2: 公司抬头 + 表单编号 =====
    sheet.mergeCells('C1:J1');
    const cnTitle = sheet.getCell('C1');
    cnTitle.value = '广东蓝电锂能有限公司';
    cnTitle.font = { name: '宋体', size: 16, bold: true };
    cnTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('C2:J2');
    const enTitle = sheet.getCell('C2');
    enTitle.value = 'Guangdong LanDazzle Technology Co., Ltd';
    enTitle.font = { name: 'Times New Roman', size: 12 };
    enTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('K1:M2');
    const formNo = sheet.getCell('K1');
    formNo.value = '表单编号：LD-SM-FM-001/A0';
    formNo.font = { name: '宋体', size: 10 };
    formNo.alignment = { horizontal: 'right', vertical: 'middle' };

    // 左侧 A1:B2 留给 logo（如果以后放进 backend/assets/logo.png 可解开下面注释）
    // const logoId = workbook.addImage({ filename: path.join(__dirname, '../../../assets/logo.png'), extension: 'png' });
    // sheet.addImage(logoId, 'A1:B2');

    sheet.getRow(1).height = 24;
    sheet.getRow(2).height = 20;

    // ===== 行 3: 大标题 =====
    sheet.mergeCells('A3:M3');
    const docTitle = sheet.getCell('A3');
    docTitle.value = '客户档案表';
    docTitle.font = { name: '宋体', size: 18, bold: true };
    docTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 32;

    // ===== 行 4: 留白 =====
    sheet.getRow(4).height = 8;

    // ===== 行 5-6: 分组表头 + 子表头 =====
    // 单列：纵向合并 5-6
    sheet.mergeCells('A5:A6');
    sheet.mergeCells('B5:B6');
    sheet.mergeCells('C5:C6');
    sheet.mergeCells('D5:D6');
    sheet.mergeCells('M5:M6');
    // 多列：横向合并组名
    sheet.mergeCells('E5:H5');
    sheet.mergeCells('I5:J5');
    sheet.mergeCells('K5:L5');

    sheet.getCell('A5').value = '序号';
    sheet.getCell('B5').value = '客户编号';
    sheet.getCell('C5').value = '客户名称';
    sheet.getCell('D5').value = '客户地址';
    sheet.getCell('E5').value = '客户联系人';
    sheet.getCell('I5').value = '客户产品';
    sheet.getCell('K5').value = '财务状况';
    sheet.getCell('M5').value = '其他信息';

    sheet.getCell('E6').value = '姓名';
    sheet.getCell('F6').value = '职务';
    sheet.getCell('G6').value = '电话';
    sheet.getCell('H6').value = '邮箱';
    sheet.getCell('I6').value = '型号';
    sheet.getCell('J6').value = '应用市场';
    sheet.getCell('K6').value = '付款方式';
    sheet.getCell('L6').value = '信用额度';

    // 表头样式：浅灰底、加粗居中、全边框
    const headerFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' },
    };
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF999999' } },
      left: { style: 'thin', color: { argb: 'FF999999' } },
      bottom: { style: 'thin', color: { argb: 'FF999999' } },
      right: { style: 'thin', color: { argb: 'FF999999' } },
    };
    for (const rowIdx of [5, 6]) {
      const row = sheet.getRow(rowIdx);
      row.height = 22;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 13) return; // 只处理 A-M
        cell.font = { name: '宋体', size: 11, bold: true };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = headerFill;
        cell.border = thinBorder;
      });
    }

    // ===== 数据行 =====
    customers.forEach((c, idx) => {
      const contact = c.contacts[0];
      const rowValues = [
        idx + 1,                                  // A 序号
        c.customerCode || '',                      // B 客户编号
        c.companyName,                             // C 客户名称
        formatAddress(c.country, c.address),       // D 客户地址：国家 + 详址
        contact?.name || '',                       // E 姓名
        contact?.title || '',                      // F 职务
        contact?.phone || '',                      // G 电话
        contact?.email || '',                      // H 邮箱
        (c.batteryModels || []).join('、'),        // I 型号（多个用顿号分隔）
        c.industry || '',                          // J 应用市场
        '',                                        // K 付款方式（留空）
        '',                                        // L 信用额度（留空）
        '',                                        // M 其他信息（留空）
      ];
      const row = sheet.addRow(rowValues);
      row.height = 24;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > 13) return;
        cell.font = { name: '宋体', size: 11 };
        cell.alignment = {
          horizontal: colNumber === 1 ? 'center' : 'left',
          vertical: 'middle',
          wrapText: true,
        };
        cell.border = thinBorder;
      });
    });

    // ===== 输出 =====
    // 客户档案表-潜在客户-20260603.xlsx
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `客户档案表-${statusLabel}-${ymd}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    // RFC 5987：中文文件名用 UTF-8 编码，避免老浏览器乱码
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="customer-archive-${ymd}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );

    await workbook.xlsx.write(res);
    res.end();
  }
}

/** 客户地址 = 国家 + 详细地址，缺一边时退化成另一边。 */
function formatAddress(country?: string | null, address?: string | null): string {
  const parts = [country, address].map((s) => (s || '').trim()).filter(Boolean);
  return parts.join('，');
}

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus | 'ALL', string> = {
  ALL: '全部客户',
  POTENTIAL: '潜在客户',
  ACTIVE: '活跃客户',
  INACTIVE: '不活跃客户',
  BLACKLISTED: '黑名单',
};
