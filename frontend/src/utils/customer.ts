export function getCustomerNameDisplay(name: string | undefined | null) {
  if (!name) return { name: '', isDeleted: false }
  if (name.startsWith('[DELETED] ')) {
    return { name: name.replace('[DELETED] ', ''), isDeleted: true }
  }
  return { name, isDeleted: false }
}

export function cleanPhoneDisplay(phone: string | undefined | null) {
  if (!phone) return ''
  const index = phone.indexOf('-deleted-')
  if (index !== -1) {
    return phone.substring(0, index)
  }
  return phone
}
