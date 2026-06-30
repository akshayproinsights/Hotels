import api from './client'
import type { Customer, Booking } from '../types'

export async function searchCustomers(q: string): Promise<Customer[]> {
  const res = await api.get<Customer[]>('/customers/search', { params: { q } })
  return res.data
}

export async function getCustomerBookings(customerId: string): Promise<Booking[]> {
  const res = await api.get<Booking[]>(`/customers/${customerId}/bookings`)
  return res.data
}

export async function updateCustomer(
  customerId: string,
  payload: Partial<Pick<Customer, 'name' | 'phone' | 'address' | 'age'>>
): Promise<Customer> {
  const res = await api.patch<Customer>(`/customers/${customerId}`, payload)
  return res.data
}
