'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineArrowDownTray,
  HiOutlinePaperAirplane,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineCheckBadge,
  HiOutlineDocumentDuplicate,
  HiOutlineBanknotes,
  HiOutlineBuildingOffice2,
} from 'react-icons/hi2';
import AppLayout from '@/components/layout/AppLayout';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/contexts/auth-context';
import {
  pisApi,
  customersApi,
  settingsApi,
  bankAccountsApi,
  piTemplatesApi,
} from '@/lib/api';
import {
  CURRENCIES,
  TRADE_TERMS,
  PAYMENT_TERMS,
  SHIPPING_METHODS,
  PAYMENT_METHODS,
  COMMON_PORTS,
  PI_STATUS_MAP,
} from '@/lib/constants';
import type {
  ProformaInvoice,
  ProformaInvoiceItem,
  Customer,
  BankAccount,
  PITemplate,
} from '@/types';

export default function PIDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAdmin } = useAuth();

  const piId = params.id as string;
  const isNew = piId === 'new';

  const [pi, setPI] = useState<ProformaInvoice | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [templates, setTemplates] = useState<PITemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<ProformaInvoice>>({
    currency: 'USD',
    validityPeriod: 7,
    shippingCharge: 0,
    other: 0,
    items: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, banksRes, tplRes, piRes, companyRes] = await Promise.all([
          customersApi.list({ pageSize: 999 }),
          bankAccountsApi.list(),
          piTemplatesApi.list(),
          isNew ? Promise.resolve(null) : pisApi.getById(piId),
          settingsApi.getCompanyInfo().catch(() => null),
        ]);
        setCustomers((customersRes as any).data?.items || []);
        const bankList: BankAccount[] = (banksRes as any).data || [];
        const tplList: PITemplate[] = (tplRes as any).data || [];
        setBanks(bankList);
        setTemplates(tplList);

        if (piRes) {
          const piData = (piRes as any).data || piRes;
          setPI(piData);
          setFormData({
            ...piData,
            shippingCharge: Number(piData.shippingCharge || 0),
            other: Number(piData.other || 0),
            subtotal: Number(piData.subtotal || 0),
            totalAmount: Number(piData.totalAmount || 0),
            items: (piData.items || []).map((item: any) => ({
              ...item,
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice || 0),
              totalPrice: Number(item.totalPrice || 0),
            })),
          });
        } else if (isNew) {
          const companyInfo = (companyRes as any)?.data || companyRes;
          const defaultBank = bankList.find((b) => b.isDefault) || bankList[0];
          const defaultTpl = tplList.find((t) => t.isDefault);

          const base: Partial<ProformaInvoice> = {
            currency: 'USD',
            validityPeriod: 7,
            shippingCharge: 0,
            other: 0,
            items: [],
            sellerId: companyInfo?.companyName || '',
            sellerAddress: companyInfo?.companyAddress || '',
            bankAccountId: defaultBank?.id || null,
          };

          // Apply default template fields if present
          if (defaultTpl) {
            applyTemplateDefaults(base, defaultTpl);
          }

          setFormData(base);
        }
      } catch {
        toast.error('加载数据失败');
        if (!isNew) router.back();
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piId, isNew]);

  const handleField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleApplyTemplate = (templateId: string) => {
    if (!templateId) {
      handleField('templateId', null);
      return;
    }
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    setFormData((prev) => {
      const next = { ...prev, templateId };
      applyTemplateDefaults(next, tpl);
      return next;
    });
    toast.success(`已应用模板「${tpl.name}」`);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...(formData.items || [])];
    const numValue = ['quantity', 'unitPrice'].includes(field) ? Number(value) || 0 : value;
    newItems[index] = { ...newItems[index], [field]: numValue };
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].totalPrice =
        Number(newItems[index].quantity || 0) * Number(newItems[index].unitPrice || 0);
    }
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...(prev.items || []),
        { productName: '', quantity: 1, unit: 'PCS', unitPrice: 0, totalPrice: 0 },
      ],
    }));
  };

  const removeItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: (prev.items || []).filter((_, i) => i !== index),
    }));
  };

  const totals = useMemo(() => {
    const subtotal = (formData.items || []).reduce(
      (sum, item) => sum + Number(item.totalPrice || 0),
      0,
    );
    const shippingCharge = Number(formData.shippingCharge || 0);
    const other = Number(formData.other || 0);
    return { subtotal, total: subtotal + shippingCharge + other };
  }, [formData.items, formData.shippingCharge, formData.other]);

  const selectedBank = useMemo(
    () => banks.find((b) => b.id === formData.bankAccountId) || null,
    [banks, formData.bankAccountId],
  );

  const handleSave = async () => {
    if (!formData.customerId) {
      toast.error('请选择客户');
      return;
    }
    if (!formData.items || formData.items.length === 0) {
      toast.error('请添加至少一个物品');
      return;
    }

    setSaving(true);
    try {
      const submitData = {
        customerId: formData.customerId,
        sellerId: formData.sellerId,
        sellerAddress: formData.sellerAddress,
        consigneeName: formData.consigneeName,
        consigneeAddress: formData.consigneeAddress,
        poNo: formData.poNo,
        currency: formData.currency,
        tradeTerm: formData.tradeTerm,
        paymentTerm: formData.paymentTerm,
        shippingMethod: formData.shippingMethod,
        portOfLoading: formData.portOfLoading,
        portOfDischarge: formData.portOfDischarge,
        placeOfDelivery: formData.placeOfDelivery,
        paymentMethod: formData.paymentMethod,
        countryOfOrigin: formData.countryOfOrigin,
        termsOfDelivery: formData.termsOfDelivery,
        notes: formData.notes,
        validityPeriod: formData.validityPeriod,
        shippingCharge: Number(formData.shippingCharge),
        other: Number(formData.other),
        bankAccountId: formData.bankAccountId || undefined,
        templateId: formData.templateId || undefined,
        items: (formData.items || []).map((item) => ({
          productName: item.productName,
          description: item.description,
          hsn: item.hsn,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
        })),
      };

      if (isNew) {
        const res: any = await pisApi.create(submitData);
        const created = res.data || res;
        toast.success('PI创建成功');
        router.push(`/pis/${created.id}`);
      } else {
        await pisApi.update(piId, submitData);
        toast.success('PI保存成功');
        const refreshed: any = await pisApi.getById(piId);
        const piData = refreshed.data || refreshed;
        setPI(piData);
        setFormData({
          ...piData,
          shippingCharge: Number(piData.shippingCharge || 0),
          other: Number(piData.other || 0),
          items: (piData.items || []).map((item: any) => ({
            ...item,
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unitPrice || 0),
            totalPrice: Number(item.totalPrice || 0),
          })),
        });
      }
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    try {
      await pisApi.submitForApproval(piId);
      toast.success('已提交审核');
      const updated: any = await pisApi.getById(piId);
      const piData = updated.data || updated;
      setPI(piData);
      setFormData((prev) => ({ ...prev, status: piData.status }));
    } catch {
      toast.error('提交失败');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const res: any = await pisApi.downloadPdf(piId);
      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pi?.piNo || 'PI'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('下载失败');
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const status = formData.status || 'DRAFT';
  const statusCfg = PI_STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  const canSubmit = status === 'DRAFT' && !isNew && !isAdmin;
  const canDownload = !isNew && (status === 'APPROVED' || (isAdmin && status !== 'DRAFT'));

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/pis')}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-apple transition-colors hover:bg-gray-50 hover:text-gray-900"
              title="返回列表"
            >
              <HiOutlineArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-gray-900">
                {isNew ? '新建 PI' : formData.piNo}
              </h1>
              <div className="mt-0.5 flex items-center gap-2 text-[12px] text-gray-500">
                {!isNew && <Badge className={statusCfg.color}>{statusCfg.label}</Badge>}
                {formData.bankAccount?.alias && (
                  <span className="inline-flex items-center gap-1">
                    <HiOutlineBanknotes className="h-3.5 w-3.5" />
                    {formData.bankAccount.alias}
                  </span>
                )}
                {formData.template?.name && (
                  <span className="inline-flex items-center gap-1">
                    <HiOutlineDocumentDuplicate className="h-3.5 w-3.5" />
                    {formData.template.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2 text-[13px] font-medium text-white shadow-apple transition-all hover:bg-primary-600 active:scale-[0.98] disabled:opacity-50"
            >
              <HiOutlineCheckBadge className="h-4 w-4" />
              {saving ? '保存中...' : '保存'}
            </button>
            {canSubmit && (
              <button
                onClick={handleSubmitForApproval}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-[13px] font-medium text-white shadow-apple transition-all hover:bg-amber-600 active:scale-[0.98]"
              >
                <HiOutlinePaperAirplane className="h-4 w-4" />
                提交审核
              </button>
            )}
            {canDownload && (
              <button
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 shadow-apple transition-colors hover:bg-gray-50"
              >
                <HiOutlineArrowDownTray className="h-4 w-4" />
                下载 PDF
              </button>
            )}
          </div>
        </div>

        {/* Rejection banner */}
        {pi?.rejectionReason && status === 'REJECTED' && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
            <span className="font-medium">拒绝原因：</span>
            {pi.rejectionReason}
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-5">
          {/* ========== Left: main form ========== */}
          <div className="col-span-12 space-y-4 lg:col-span-8">
            {/* Template + Bank (quick pickers) */}
            <Section title="模板与银行账户" icon={<HiOutlineDocumentDuplicate className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="PI 模板">
                  <select
                    value={formData.templateId || ''}
                    onChange={(e) => handleApplyTemplate(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">不使用模板</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.isDefault ? '（默认）' : ''}
                      </option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      还没有模板？可在 <button onClick={() => router.push('/settings')} className="text-primary-600 hover:underline">系统设置</button> 里创建。
                    </p>
                  )}
                </Field>
                <Field label="收款银行账户">
                  <select
                    value={formData.bankAccountId || ''}
                    onChange={(e) => handleField('bankAccountId', e.target.value || null)}
                    className={selectCls}
                  >
                    <option value="">未指定（使用默认账户）</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.alias}
                        {b.currency ? `  ·  ${b.currency}` : ''}
                        {b.isDefault ? '（默认）' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {selectedBank && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-[12px] leading-5 text-gray-600">
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-400">
                    将出现在 PDF 下方的收款信息
                  </div>
                  {[
                    selectedBank.accountName && `Account name: ${selectedBank.accountName}`,
                    selectedBank.accountNumber && `Account number: ${selectedBank.accountNumber}`,
                    selectedBank.swiftCode && `SWIFT/BIC: ${selectedBank.swiftCode}`,
                    selectedBank.bankName && `Bank: ${selectedBank.bankName}`,
                    selectedBank.bankAddress && `Address: ${selectedBank.bankAddress}`,
                  ]
                    .filter(Boolean)
                    .map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                </div>
              )}
            </Section>

            {/* Basic info */}
            <Section title="基本信息" icon={<HiOutlineBuildingOffice2 className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="客户" required>
                  <select
                    value={formData.customerId || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const selected = customers.find((c) => c.id === selectedId);
                      setFormData((prev) => ({
                        ...prev,
                        customerId: selectedId,
                        consigneeName: selected?.companyName || prev.consigneeName || '',
                        consigneeAddress: selected?.address || prev.consigneeAddress || '',
                      }));
                    }}
                    className={selectCls}
                  >
                    <option value="">选择客户...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="PO 号">
                  <input
                    type="text"
                    value={formData.poNo || ''}
                    onChange={(e) => handleField('poNo', e.target.value)}
                    className={inputCls}
                    placeholder="客户采购订单号"
                  />
                </Field>
                <Field label="币种">
                  <select
                    value={formData.currency || 'USD'}
                    onChange={(e) => handleField('currency', e.target.value)}
                    className={selectCls}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="有效期（天）">
                  <input
                    type="number"
                    min={1}
                    value={formData.validityPeriod || 7}
                    onChange={(e) => handleField('validityPeriod', Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
              </div>
            </Section>

            {/* Parties */}
            <Section title="买卖双方">
              <div className="grid grid-cols-2 gap-4">
                <Field label="卖方名称">
                  <input
                    type="text"
                    value={formData.sellerId || ''}
                    onChange={(e) => handleField('sellerId', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="收货人名称">
                  <input
                    type="text"
                    value={formData.consigneeName || ''}
                    onChange={(e) => handleField('consigneeName', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="卖方地址">
                  <textarea
                    value={formData.sellerAddress || ''}
                    onChange={(e) => handleField('sellerAddress', e.target.value)}
                    rows={2}
                    className={textareaCls}
                  />
                </Field>
                <Field label="收货人地址">
                  <textarea
                    value={formData.consigneeAddress || ''}
                    onChange={(e) => handleField('consigneeAddress', e.target.value)}
                    rows={2}
                    className={textareaCls}
                  />
                </Field>
              </div>
            </Section>

            {/* Trade terms */}
            <Section title="贸易条款">
              <div className="grid grid-cols-2 gap-4">
                <Field label="贸易术语 (Incoterms)">
                  <select
                    value={formData.tradeTerm || ''}
                    onChange={(e) => handleField('tradeTerm', e.target.value || undefined)}
                    className={selectCls}
                  >
                    <option value="">请选择</option>
                    {TRADE_TERMS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label} — {t.desc}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="付款条款">
                  <select
                    value={formData.paymentTerm || ''}
                    onChange={(e) => handleField('paymentTerm', e.target.value || undefined)}
                    className={selectCls}
                  >
                    <option value="">请选择</option>
                    {PAYMENT_TERMS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="运输方式">
                  <select
                    value={formData.shippingMethod || ''}
                    onChange={(e) => handleField('shippingMethod', e.target.value || undefined)}
                    className={selectCls}
                  >
                    <option value="">请选择</option>
                    {SHIPPING_METHODS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="付款方式">
                  <select
                    value={formData.paymentMethod || ''}
                    onChange={(e) => handleField('paymentMethod', e.target.value || undefined)}
                    className={selectCls}
                  >
                    <option value="">请选择</option>
                    {PAYMENT_METHODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="装货港口">
                  <input
                    type="text"
                    list="ports-list"
                    value={formData.portOfLoading || ''}
                    onChange={(e) => handleField('portOfLoading', e.target.value)}
                    className={inputCls}
                    placeholder="如 Shanghai, China"
                  />
                </Field>
                <Field label="卸货港口">
                  <input
                    type="text"
                    list="ports-list"
                    value={formData.portOfDischarge || ''}
                    onChange={(e) => handleField('portOfDischarge', e.target.value)}
                    className={inputCls}
                    placeholder="如 Los Angeles, USA"
                  />
                </Field>
                <Field label="交货地点">
                  <input
                    type="text"
                    value={formData.placeOfDelivery || ''}
                    onChange={(e) => handleField('placeOfDelivery', e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="原产国">
                  <input
                    type="text"
                    value={formData.countryOfOrigin || ''}
                    onChange={(e) => handleField('countryOfOrigin', e.target.value)}
                    className={inputCls}
                    placeholder="China"
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="交货条款 (Terms of Delivery)">
                    <input
                      type="text"
                      value={formData.termsOfDelivery || ''}
                      onChange={(e) => handleField('termsOfDelivery', e.target.value)}
                      className={inputCls}
                      placeholder="Only after full payment is received"
                    />
                  </Field>
                </div>
              </div>
              <datalist id="ports-list">
                {COMMON_PORTS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Section>

            {/* Items */}
            <Section
              title="货物明细"
              action={
                <button
                  onClick={addItem}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <HiOutlinePlus className="h-3.5 w-3.5" />
                  添加物品
                </button>
              }
            >
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-[13px]">
                  <thead className="bg-gray-50/60 text-[11px] uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">品名</th>
                      <th className="px-3 py-2 text-left font-medium">规格</th>
                      <th className="px-3 py-2 text-left font-medium">HS</th>
                      <th className="px-3 py-2 text-right font-medium w-20">数量</th>
                      <th className="px-3 py-2 text-left font-medium w-20">单位</th>
                      <th className="px-3 py-2 text-right font-medium w-28">单价</th>
                      <th className="px-3 py-2 text-right font-medium w-28">小计</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(formData.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                          尚未添加物品 — 点击右上角「添加物品」开始
                        </td>
                      </tr>
                    ) : (
                      (formData.items || []).map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50/50">
                          <td className="p-1.5">
                            <CellInput
                              value={item.productName || ''}
                              onChange={(v) => handleItemChange(index, 'productName', v)}
                            />
                          </td>
                          <td className="p-1.5">
                            <CellInput
                              value={item.description || ''}
                              onChange={(v) => handleItemChange(index, 'description', v)}
                            />
                          </td>
                          <td className="p-1.5">
                            <CellInput
                              value={item.hsn || ''}
                              onChange={(v) => handleItemChange(index, 'hsn', v)}
                            />
                          </td>
                          <td className="p-1.5">
                            <CellInput
                              type="number"
                              align="right"
                              value={item.quantity ?? 0}
                              onChange={(v) => handleItemChange(index, 'quantity', v)}
                            />
                          </td>
                          <td className="p-1.5">
                            <CellInput
                              value={item.unit || 'PCS'}
                              onChange={(v) => handleItemChange(index, 'unit', v)}
                            />
                          </td>
                          <td className="p-1.5">
                            <CellInput
                              type="number"
                              align="right"
                              value={item.unitPrice ?? 0}
                              onChange={(v) => handleItemChange(index, 'unitPrice', v)}
                            />
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium tabular-nums text-gray-900">
                            {formData.currency} {Number(item.totalPrice || 0).toFixed(2)}
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              onClick={() => removeItem(index)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="删除"
                            >
                              <HiOutlineTrash className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Charges & notes */}
            <Section title="费用与备注">
              <div className="grid grid-cols-2 gap-4">
                <Field label="运费">
                  <input
                    type="number"
                    value={formData.shippingCharge ?? 0}
                    onChange={(e) => handleField('shippingCharge', Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <Field label="其他费用">
                  <input
                    type="number"
                    value={formData.other ?? 0}
                    onChange={(e) => handleField('other', Number(e.target.value))}
                    className={inputCls}
                  />
                </Field>
                <div className="col-span-2">
                  <Field label="备注 (Notes)">
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => handleField('notes', e.target.value)}
                      rows={2}
                      className={textareaCls}
                      placeholder="例如：Sample only — No commercial value"
                    />
                  </Field>
                </div>
              </div>
            </Section>
          </div>

          {/* ========== Right: sticky summary ========== */}
          <div className="col-span-12 lg:col-span-4">
            <div className="sticky top-4 space-y-4">
              <div className="rounded-2xl border border-gray-200/80 bg-white shadow-apple">
                <div className="border-b border-gray-100 px-5 py-3">
                  <h3 className="text-[14px] font-semibold text-gray-900">订单金额</h3>
                </div>
                <div className="space-y-2.5 px-5 py-4 text-[13px]">
                  <Row label="小计" value={`${formData.currency} ${totals.subtotal.toFixed(2)}`} />
                  <Row
                    label="运费"
                    value={`${formData.currency} ${Number(formData.shippingCharge || 0).toFixed(2)}`}
                  />
                  <Row
                    label="其他"
                    value={`${formData.currency} ${Number(formData.other || 0).toFixed(2)}`}
                  />
                  <div className="my-2 h-px bg-gray-100" />
                  <div className="flex items-baseline justify-between">
                    <span className="text-gray-500">总计</span>
                    <span className="text-[20px] font-semibold tracking-tight text-gray-900 tabular-nums">
                      {formData.currency} {totals.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200/80 bg-white p-5 text-[12px] leading-5 text-gray-500 shadow-apple">
                <h4 className="mb-2 text-[13px] font-medium text-gray-900">小贴士</h4>
                <ul className="list-disc space-y-1 pl-4">
                  <li>选择模板可自动填充常用字段</li>
                  <li>银行账户决定 PDF 里的收款信息</li>
                  <li>业务员保存后需提交审核才能生成 PDF</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ==================== Helpers ====================

/**
 * Copy template default fields onto a PI form object. Only overwrites empty
 * fields so we don't clobber user edits when they re-apply a template.
 * Template values are authoritative for the "selectable" fields (trade term,
 * payment method, shipping method, bank account) because those are the
 * whole point of a template.
 */
function applyTemplateDefaults(target: Partial<ProformaInvoice>, tpl: PITemplate) {
  if (tpl.currency) target.currency = tpl.currency;
  if (tpl.tradeTerm) target.tradeTerm = tpl.tradeTerm;
  if (tpl.paymentTerm) target.paymentTerm = tpl.paymentTerm;
  if (tpl.shippingMethod) target.shippingMethod = tpl.shippingMethod;
  if (tpl.paymentMethod) target.paymentMethod = tpl.paymentMethod;
  if (tpl.portOfLoading) target.portOfLoading = tpl.portOfLoading;
  if (tpl.portOfDischarge) target.portOfDischarge = tpl.portOfDischarge;
  if (tpl.placeOfDelivery) target.placeOfDelivery = tpl.placeOfDelivery;
  if (tpl.countryOfOrigin) target.countryOfOrigin = tpl.countryOfOrigin;
  if (tpl.termsOfDelivery) target.termsOfDelivery = tpl.termsOfDelivery;
  if (tpl.notes) target.notes = tpl.notes;
  if (tpl.validityPeriod) target.validityPeriod = tpl.validityPeriod;
  if (tpl.bankAccountId) target.bankAccountId = tpl.bankAccountId;
}

// ==================== Sub-components ====================

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';
const textareaCls = inputCls + ' resize-none';
const selectCls = inputCls + ' cursor-pointer';

function Section({
  title,
  children,
  icon,
  action,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-apple">
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-gray-900">
          {icon && <span className="text-gray-400">{icon}</span>}
          {title}
        </h3>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900 tabular-nums">{value}</span>
    </div>
  );
}

function CellInput({
  value,
  onChange,
  type = 'text',
  align = 'left',
}: {
  value: string | number;
  onChange: (v: any) => void;
  type?: 'text' | 'number';
  align?: 'left' | 'right';
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-[13px] text-gray-900 transition-colors hover:border-gray-200 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
        align === 'right' ? 'text-right tabular-nums' : ''
      }`}
    />
  );
}
