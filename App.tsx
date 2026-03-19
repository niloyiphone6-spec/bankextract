import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import * as XLSX from 'xlsx';
import { 
  Upload, 
  FileText, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Table as TableIcon,
  X
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types for the extracted data
interface Transaction {
  date: string;
  particulars: string;
  withdrawal: string | number;
  deposit: string | number;
  balance: string | number;
}

interface BankStatementData {
  bankName: string;
  fromDate: string;
  toDate: string;
  transactions: Transaction[];
}

const GEMINI_MODEL = "gemini-3.1-pro-preview";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<BankStatementData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/')) {
        setFile(selectedFile);
        setError(null);
        setExtractedData(null);
      } else {
        setError('Please upload a PDF or an image of your bank statement.');
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const processStatement = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const base64Data = await fileToBase64(file);

      const prompt = `
        Extract transaction data from this bank statement. 
        Return the data in a structured JSON format.

        CRITICAL INSTRUCTIONS:
        1. Identify the 'Statement Period' (From Date and To Date) correctly from the document headers.
        2. ONLY extract entries that are actual transactions within the statement period table.
        3. DO NOT include summary tables, totals, balance summaries, or account overviews as transactions.
        4. If a row does not have a valid transaction date or is part of a summary section at the end or beginning, IGNORE it.
        5. Ensure the 'date' field for each transaction is a real date found in the transaction table, not a random number or a date from a summary section.
        6. The 'toDate' should reflect the actual end of the statement period as stated on the document.
        7. Analyze the document carefully to distinguish between the transaction list and the summary/totals section.

        JSON Fields:
        - bankName: The name of the bank.
        - fromDate: The start date of the statement period.
        - toDate: The end date of the statement period.
        - transactions: An array of objects, each containing:
          - date: The transaction date.
          - particulars: Description of the transaction.
          - withdrawal: Amount withdrawn (if any).
          - deposit: Amount deposited (if any).
          - balance: The resulting balance after the transaction.

        Ensure all amounts are numbers or strings representing numbers. 
        If a field is missing, use an empty string.
      `;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.type,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bankName: { type: Type.STRING },
              fromDate: { type: Type.STRING },
              toDate: { type: Type.STRING },
              transactions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    particulars: { type: Type.STRING },
                    withdrawal: { type: Type.STRING },
                    deposit: { type: Type.STRING },
                    balance: { type: Type.STRING },
                  },
                  required: ["date", "particulars", "balance"],
                },
              },
            },
            required: ["bankName", "transactions"],
          },
        },
      });

      const result = JSON.parse(response.text || '{}') as BankStatementData;
      setExtractedData(result);
    } catch (err) {
      console.error('Error processing statement:', err);
      setError('Failed to process the statement. Please ensure the file is clear and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadExcel = () => {
    if (!extractedData) return;

    const { bankName, fromDate, toDate, transactions } = extractedData;

    // Prepare data for Excel
    const headerInfo = [
      ['Bank Name:', bankName],
      ['Statement Period:', `${fromDate} to ${toDate}`],
      [], // Empty row
      ['Date', 'Particulars', 'Withdrawal', 'Deposit', 'Balance']
    ];

    const transactionRows = transactions.map(t => [
      t.date,
      t.particulars,
      t.withdrawal,
      t.deposit,
      t.balance
    ]);

    const worksheetData = [...headerInfo, ...transactionRows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');

    // Generate and download file
    XLSX.writeFile(workbook, `${bankName.replace(/\s+/g, '_')}_Statement.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] py-6 px-8 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#10B981] rounded-lg flex items-center justify-center text-white">
            <TableIcon size={24} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">BankExtract AI</h1>
            <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wider">Statement to Excel Converter</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto py-12 px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8 shadow-sm">
              <h2 className="text-lg font-semibold mb-2">Upload Statement</h2>
              <p className="text-sm text-[#6B7280] mb-6">Upload your bank statement in PDF or image format to extract transactions.</p>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200",
                  file ? "border-[#10B981] bg-[#ECFDF5]" : "border-[#D1D5DB] hover:border-[#10B981] hover:bg-[#F9FAFB]"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="application/pdf,image/*"
                  className="hidden"
                />
                {file ? (
                  <div className="text-center">
                    <FileText size={48} className="text-[#10B981] mx-auto mb-4" />
                    <p className="text-sm font-medium text-[#1A1A1A] truncate max-w-[200px]">{file.name}</p>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setExtractedData(null);
                      }}
                      className="mt-2 text-xs text-[#EF4444] hover:underline flex items-center gap-1 mx-auto"
                    >
                      <X size={12} /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload size={48} className="text-[#9CA3AF] mx-auto mb-4" />
                    <p className="text-sm font-medium text-[#4B5563]">Click or drag to upload</p>
                    <p className="text-xs text-[#9CA3AF] mt-1">PDF, PNG, JPG (Max 10MB)</p>
                  </div>
                )}
              </div>

              <button
                disabled={!file || isProcessing}
                onClick={processStatement}
                className={cn(
                  "w-full mt-6 py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200",
                  !file || isProcessing 
                    ? "bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed" 
                    : "bg-[#1A1A1A] text-white hover:bg-[#333333] active:scale-[0.98]"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Processing with AI...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={20} />
                    Extract Data
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-[#FEF2F2] border border-[#FEE2E2] rounded-xl flex items-start gap-3 text-[#B91C1C]">
                  <AlertCircle size={20} className="shrink-0 mt-0.5" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="bg-[#1A1A1A] rounded-2xl p-8 text-white shadow-xl">
              <h3 className="text-sm font-bold uppercase tracking-widest text-[#10B981] mb-4">How it works</h3>
              <ul className="space-y-4">
                {[
                  "Upload any bank statement format",
                  "Gemini AI identifies headers and rows",
                  "Extracts metadata like bank name and period",
                  "Download a perfectly formatted Excel sheet"
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-[#D1D5DB]">
                    <span className="text-[#10B981] font-mono">0{i+1}</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Column: Preview & Export */}
          <div className="lg:col-span-7">
            {extractedData ? (
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-6 border-b border-[#E5E7EB] flex items-center justify-between bg-[#F9FAFB]">
                  <div>
                    <h2 className="text-lg font-semibold">{extractedData.bankName}</h2>
                    <p className="text-sm text-[#6B7280]">
                      {extractedData.fromDate} — {extractedData.toDate}
                    </p>
                  </div>
                  <button
                    onClick={downloadExcel}
                    className="bg-[#10B981] text-white py-2 px-4 rounded-lg font-medium flex items-center gap-2 hover:bg-[#059669] transition-colors shadow-sm active:scale-95"
                  >
                    <Download size={18} />
                    Download Excel
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#F3F4F6] text-[#4B5563] text-xs uppercase tracking-wider">
                        <th className="px-6 py-4 font-semibold">Date</th>
                        <th className="px-6 py-4 font-semibold">Particulars</th>
                        <th className="px-6 py-4 font-semibold text-right">Withdrawal</th>
                        <th className="px-6 py-4 font-semibold text-right">Deposit</th>
                        <th className="px-6 py-4 font-semibold text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {extractedData.transactions.map((t, i) => (
                        <tr key={i} className="hover:bg-[#F9FAFB] transition-colors">
                          <td className="px-6 py-4 text-sm font-mono text-[#6B7280] whitespace-nowrap">{t.date}</td>
                          <td className="px-6 py-4 text-sm text-[#1A1A1A] max-w-xs truncate">{t.particulars}</td>
                          <td className="px-6 py-4 text-sm text-right text-[#EF4444] font-medium">{t.withdrawal || '-'}</td>
                          <td className="px-6 py-4 text-sm text-right text-[#10B981] font-medium">{t.deposit || '-'}</td>
                          <td className="px-6 py-4 text-sm text-right font-semibold">{t.balance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {extractedData.transactions.length === 0 && (
                  <div className="py-20 text-center">
                    <p className="text-[#6B7280]">No transactions found in this statement.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full min-h-[400px] bg-white rounded-2xl border border-[#E5E7EB] border-dashed flex flex-col items-center justify-center text-center p-12">
                <div className="w-16 h-16 bg-[#F3F4F6] rounded-full flex items-center justify-center text-[#9CA3AF] mb-4">
                  <TableIcon size={32} />
                </div>
                <h3 className="text-lg font-medium text-[#4B5563]">Preview Area</h3>
                <p className="text-sm text-[#9CA3AF] max-w-xs mt-2">
                  Once you extract the data, your transactions will appear here for review before downloading.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto py-12 px-6 border-t border-[#E5E7EB] mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-[#6B7280]">
            <TableIcon size={18} />
            <span className="text-sm font-medium">BankExtract AI © 2026</span>
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-sm text-[#6B7280] hover:text-[#1A1A1A] transition-colors">Privacy Policy</a>
            <a href="#" className="text-sm text-[#6B7280] hover:text-[#1A1A1A] transition-colors">Terms of Service</a>
            <a href="#" className="text-sm text-[#6B7280] hover:text-[#1A1A1A] transition-colors">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
