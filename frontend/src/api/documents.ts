import api from './client'
import axios from 'axios'
import type { Document } from '../types'

export interface UploadUrlResponse {
  upload_url: string
  document_id: string
  r2_key: string
}

export async function getUploadUrl(
  bookingId: string,
  guestId: string,
  fileName: string,
  contentType: string
): Promise<UploadUrlResponse> {
  const res = await api.post<UploadUrlResponse>('/documents/upload-url', {
    booking_id: bookingId,
    guest_id: guestId,
    file_name: fileName,
    content_type: contentType,
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

export async function uploadFileToR2(uploadUrl: string, file: File): Promise<void> {
  // Use a clean axios instance to upload directly to R2 (without JWT Authorization header)
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  })
}
