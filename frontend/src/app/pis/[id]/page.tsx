'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/auth-context';
import { pisApi, customersApi } from '@/lib/api';
import type { ProformaInvoice, ProformaInvoiceItem, Customer } from '@/types';

export default function PIDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser, isAdmin } = useAuth();

  const piId = params.id as string;
  const isNew = piId === 'new';

  const [pi, setPI] = useState<ProformaInvoice | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form state
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
        const [customersRes, piRes] = await Promise.all([
          customersApi.list({ pageSize: 999 }),
          isNew ? Promise.resolve(null) : pisApi.getById(piId),
        ]);
        setCustomers((customersRes as any).data?.items || (customersRes as any).items || []);
        if (piRes) {
          const pi = (piRes as any).data || piRes;
          setPI(pi);
          // Ensure numeric fields are proper numbers (Prisma Decimal comes as string)
          setFormData({
            ...pi,
            shippingCharge: Number(pi.shippingCharge || 0),
            other: Number(pi.other || 0),
            subtotal: Number(pi.subtotal || 0),
            totalAmount: Number(pi.totalAmount || 0),
            items: (pi.items || []).map((item: any) => ({
              ...item,
              quantity: Number(item.quantity || 0),
              unitPrice: Number(item.unitPrice || 0),
              totalPrice: Number(item.totalPrice || 0),
            })),
          });
        }
      } catch {
        toast.error('加载数据失败');
        if (!isNew) router.back();
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [piId, isNew, router]);

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...(formData.items || [])];
    const numValue = ['quantity', 'unitPrice'].includes(field) ? Number(value) || 0 : value;
    newItems[index] = { ...newItems[index], [field]: numValue };

    // Recalculate totals
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].totalPrice = Number(newItems[index].quantity || 0) * Number(newItems[index].unitPrice || 0);
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

  const calculateTotals = () => {
    const subtotal = (formData.items || []).reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const shippingCharge = Number(formData.shippingCharge || 0);
    const other = Number(formData.other || 0);
    return {
      subtotal,
      total: subtotal + shippingCharge + other,
    };
  };

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
        countryOfOrigin: (formData as any).countryOfOrigin,
        termsOfDelivery: (formData as any).termsOfDelivery,
        notes: (formData as any).notes,
        validityPeriod: formData.validityPeriod,
        shippingCharge: Number(formData.shippingCharge),
        other: Number(formData.other),
        items: formData.items.map((item) => ({
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
        const piData = res.data || res;
        toast.success('PI创建成功');
        router.push(`/pis/${piData.id}`);
      } else {
        await pisApi.update(piId, submitData);
        toast.success('PI保存成功');
        // Refresh data
        const updated: any = await pisApi.getById(piId);
        const piData = updated.data || updated;
        setPI(piData);
        setFormData(piData);
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
      setFormData(piData);
    } catch {
      toast.error('提交失败');
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const res: any = await pisApi.downloadPdf(piId);
      // The interceptor returns response.data, which is a Blob
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

  const totals = calculateTotals();
  const canEdit = true; // All PIs can be edited
  const canSubmit = formData.status === 'DRAFT' && !isAdmin;
  const canDownload = formData.status === 'APPROVED' || (isAdmin && formData.status !== 'DRAFT');

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 flex justify-center items-center">加载中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            {isNew ? '新建PI' : formData.piNo}
          </h1>
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900"
          >
            ← 返回
          </button>
        </div>

        {pi && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              状态: <span className="font-bold">{
                {
                  DRAFT: '草稿',
                  PENDING_APPROVAL: '待审核',
                  APPROVED: '已批准',
                  REJECTED: '已拒绝',
                }[pi.status] || pi.status
              }</span>
              {pi.rejectionReason && <span className="ml-4">拒绝原因: {pi.rejectionReason}</span>}
            </p>
          </div>
        )}

        {/* Main Form */}
        <div className="grid grid-cols-3 gap-6">
          {/* Form Section */}
          <div className="col-span-2 space-y-6">
            {/* Basic Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">基本信息</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    客户 *
                  </label>
                  <select
                    value={formData.customerId || ''}
                    onChange={(e) => handleFieldChange('customerId', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  >
                    <option value="">选择客户...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    币种
                  </label>
                  <input
                    type="text"
                    value={formData.currency || ''}
                    onChange={(e) => handleFieldChange('currency', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PO号
                  </label>
                  <input
                    type="text"
                    value={formData.poNo || ''}
                    onChange={(e) => handleFieldChange('poNo', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    有效期（天）
                  </label>
                  <input
                    type="number"
                    value={formData.validityPeriod || 7}
                    onChange={(e) => handleFieldChange('validityPeriod', Number(e.target.value))}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Seller Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">卖方信息</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    公司名称
                  </label>
                  <input
                    type="text"
                    value={formData.sellerId || ''}
                    onChange={(e) => handleFieldChange('sellerId', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    地址
                  </label>
                  <textarea
                    value={formData.sellerAddress || ''}
                    onChange={(e) => handleFieldChange('sellerAddress', e.target.value)}
                    disabled={!canEdit}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Consignee Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">收货人信息</h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    收货人名称
                  </label>
                  <input
                    type="text"
                    value={formData.consigneeName || ''}
                    onChange={(e) => handleFieldChange('consigneeName', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    地址
                  </label>
                  <textarea
                    value={formData.consigneeAddress || ''}
                    onChange={(e) => handleFieldChange('consigneeAddress', e.target.value)}
                    disabled={!canEdit}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Trade Terms */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">贸易条款</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    贸易术语
                  </label>
                  <select
                    value={formData.tradeTerm || ''}
                    onChange={(e) => handleFieldChange('tradeTerm', e.target.value || undefined)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  >
                    <option value="">选择贸易术语...</option>
                    <option value="EXW">EXW</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="CIP">CIP</option>
                    <option value="DPU">DPU</option>
                    <option value="DDP">DDP</option>
                    <option value="FCA">FCA</option>
                    <option value="FAS">FAS</option>
                    <option value="CFR">CFR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    付款条款
                  </label>
                  <select
                    value={formData.paymentTerm || ''}
                    onChange={(e) => handleFieldChange('paymentTerm', e.target.value || undefined)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  >
                    <option value="">选择付款条款...</option>
                    <option value="T_30">30% 预付</option>
                    <option value="T_50">50% 预付</option>
                    <option value="T_70">70% 预付</option>
                    <option value="T_100">100% 预付</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    运输方式
                  </label>
                  <input
                    type="text"
                    value={formData.shippingMethod || ''}
                    onChange={(e) => handleFieldChange('shippingMethod', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    付款方式
                  </label>
                  <input
                    type="text"
                    value={formData.paymentMethod || ''}
                    onChange={(e) => handleFieldChange('paymentMethod', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    装货港口
                  </label>
                  <input
                    type="text"
                    value={formData.portOfLoading || ''}
                    onChange={(e) => handleFieldChange('portOfLoading', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    卸货港口
                  </label>
                  <input
                    type="text"
                    value={formData.portOfDischarge || ''}
                    onChange={(e) => handleFieldChange('portOfDischarge', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    交货地点
                  </label>
                  <input
                    type="text"
                    value={formData.placeOfDelivery || ''}
                    onChange={(e) => handleFieldChange('placeOfDelivery', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    原产国
                  </label>
                  <input
                    type="text"
                    value={(formData as any).countryOfOrigin || ''}
                    onChange={(e) => handleFieldChange('countryOfOrigin', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                    placeholder="China"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    交货条款 (Terms of Delivery)
                  </label>
                  <input
                    type="text"
                    value={(formData as any).termsOfDelivery || ''}
                    onChange={(e) => handleFieldChange('termsOfDelivery', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                    placeholder="Only after full payment is received"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-900">货物明细</h2>
                {canEdit && (
                  <button
                    onClick={addItem}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    + 添加物品
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">品名</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">规格</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">HS编码</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">数量</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700">单位</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">单价</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-700">小计</th>
                      {canEdit && <th className="px-4 py-2 text-center font-semibold text-gray-700">操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.items || []).map((item, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.productName || ''}
                            onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.hsn || ''}
                            onChange={(e) => handleItemChange(index, 'hsn', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={item.quantity || 0}
                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-right disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={item.unit || ''}
                            onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            value={item.unitPrice || 0}
                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-right disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {formData.currency} {Number(item.totalPrice || 0).toFixed(2)}
                        </td>
                        {canEdit && (
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeItem(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              删除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charges */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">费用</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    运费
                  </label>
                  <input
                    type="number"
                    value={formData.shippingCharge || 0}
                    onChange={(e) => handleFieldChange('shippingCharge', Number(e.target.value))}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    其他费用
                  </label>
                  <input
                    type="number"
                    value={formData.other || 0}
                    onChange={(e) => handleFieldChange('other', Number(e.target.value))}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    备注 (Notes，如 Sample only — No commercial value)
                  </label>
                  <input
                    type="text"
                    value={(formData as any).notes || ''}
                    onChange={(e) => handleFieldChange('notes', e.target.value)}
                    disabled={!canEdit}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Summary Panel */}
          <div className="col-span-1">
            {/* Summary */}
            <div className="bg-white rounded-lg shadow p-6 sticky top-20">
              <h2 className="text-lg font-bold text-gray-900 mb-4">小计</h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>小计:</span>
                  <span className="font-medium">
                    {formData.currency} {totals.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>运费:</span>
                  <span className="font-medium">
                    {formData.currency} {Number(formData.shippingCharge || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>其他:</span>
                  <span className="font-medium">
                    {formData.currency} {Number(formData.other || 0).toFixed(2)}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between text-base font-bold">
                  <span>总计:</span>
                  <span>{formData.currency} {totals.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-2">
                {canEdit && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                )}
                {canSubmit && (
                  <button
                    onClick={handleSubmitForApproval}
                    className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700"
                  >
                    提交审核
                  </button>
                )}
                {canDownload && (
                  <button
                    onClick={handleDownloadPdf}
                    className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                  >
                    下载 PDF
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
