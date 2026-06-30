import api from './client'
import axios from 'axios'
import type { Document } from '../types'
import { compressImages } from '../utils/imageCompressor'

export interface UploadUrlResponse {
  upload_url: string
  document_id: string
  r2_key: string
}

export async function getUploadUrl(
  bookingId: string,
  customerId: string,
  fileName: string,
  contentType: string,
  docType?: string
): Promise<UploadUrlResponse> {
  const res = await api.post<UploadUrlResponse>('/documents/upload-url', {
    booking_id: bookingId,
    customer_id: customerId,
    file_name: fileName,
    content_type: contentType,
    doc_type: docType,
  })
  return res.data
}

export async function confirmUpload(documentId: string): Promise<{ public_url: string }> {
  const res = await api.post<{ public_url: string }>('/documents/confirm', {
    document_id: documentId,
  })
  return res.data
}

export async function listDocs(bookingId: string): Promise<Document[]> {
  const res = await api.get<Document[]>(`/documents/booking/${bookingId}`)
  return res.data
}

export async function listCustomerDocs(customerId: string): Promise<Document[]> {
  const res = await api.get<Document[]>(`/documents/customer/${customerId}`)
  return res.data
}

export async function uploadFileToR2(uploadUrl: string, file: File): Promise<void> {
  // Use a clean axios instance to upload directly to R2 (without JWT Authorization header)
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  })
}

export interface ExtractedDetails {
  name: string
  address?: string
  age?: number | null
}

export async function extractNameFromId(files: File | File[]): Promise<ExtractedDetails> {
  const formData = new FormData()
  const rawFilesArray = Array.isArray(files) ? files : [files]
  const compressedFiles = await compressImages(rawFilesArray)
  compressedFiles.forEach(file => {
    formData.append('files', file)
  })
  const res = await api.post<ExtractedDetails>('/documents/extract-name', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return res.data
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/documents/${documentId}`)
}

