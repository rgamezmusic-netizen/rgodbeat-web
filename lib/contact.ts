export const CONTACT_EMAIL = "rgodbeat@gmail.com";
export const WHATSAPP_URL = "https://wa.me/17373067677";

export function contactDestinations(subject: string, message: string) {
  return {
    email: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`,
    whatsapp: `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`,
  };
}
