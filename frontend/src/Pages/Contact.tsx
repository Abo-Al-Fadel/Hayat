// src/Pages/Contact.tsx
import React, { useState } from "react";
import toast from "react-hot-toast";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import "./Home.css";
import leaf from "../Images/leaf.png";
import { PublicHeader } from "../Components/PublicHeader";

/**
 * Public contact page. Shares the Home page's radial-gradient theme and header.
 *
 * NOTE: the details below are placeholder data and the form does not submit anywhere -
 * there is no contact endpoint on the API. Replace both before going live.
 */

const DETAILS = [
  {
    icon: Phone,
    label: "Phone",
    lines: ["+961 1 234 567", "+961 70 123 456"],
  },
  {
    icon: Mail,
    label: "Email",
    lines: ["hello@hayat-pharmacy.example", "support@hayat-pharmacy.example"],
  },
  {
    icon: MapPin,
    label: "Address",
    lines: ["12 Rue Hamra", "Beirut, Lebanon"],
  },
  {
    icon: Clock,
    label: "Opening hours",
    lines: ["Mon – Sat: 08:00 – 20:00", "Sunday: 10:00 – 16:00"],
  },
];

const Contact: React.FC = () => {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // No contact endpoint exists yet; this only acknowledges the user rather than
    // pretending a message was delivered.
    await new Promise((r) => setTimeout(r, 500));
    setSending(false);
    setForm({ name: "", email: "", message: "" });
    toast.success("Thanks! This form is a demo and does not send anything yet.");
  };

  return (
    <div className="relative bg-homepage min-h-screen text-white px-4 sm:px-6 md:px-14">
      <PublicHeader active="contact" />

      <main className="relative z-20 pb-16">
        <div className="text-center mt-4 md:mt-8 max-w-2xl mx-auto">
          <h1 className="font-extrabold text-[32px] sm:text-[44px] md:text-[56px] leading-[1.1]">
            Get in touch
          </h1>
          <p className="text-gray-200/80 mt-3 text-base md:text-lg">
            Questions about an order, stock or your account? We are happy to help.
          </p>
          <div className="mt-4 h-1 w-28 bg-gray-400/50 mx-auto rounded-full" />
        </div>

        <div className="max-w-[1100px] mx-auto mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Contact details */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DETAILS.map(({ icon: Icon, label, lines }) => (
              <div
                key={label}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/15"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-5 w-5 text-white/90" aria-hidden="true" />
                  <h2 className="font-semibold">{label}</h2>
                </div>
                {lines.map((line) => (
                  <p key={line} className="text-sm text-gray-200/80 leading-relaxed">
                    {line}
                  </p>
                ))}
              </div>
            ))}
          </section>

          {/* Message form */}
          <section className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/15">
            <h2 className="text-xl font-semibold mb-1">Send us a message</h2>
            <p className="text-xs text-gray-200/70 mb-4">
              Demo form — messages are not delivered yet.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="contact-name" className="block text-white/80 mb-1 text-sm">
                  Name
                </label>
                <input
                  id="contact-name"
                  value={form.name}
                  onChange={update("name")}
                  placeholder="Your name"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/25 placeholder-white/70 text-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="block text-white/80 mb-1 text-sm">
                  Email
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/25 placeholder-white/70 text-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="contact-message" className="block text-white/80 mb-1 text-sm">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  value={form.message}
                  onChange={update("message")}
                  placeholder="How can we help?"
                  rows={5}
                  required
                  className="w-full px-4 py-3 rounded-lg bg-white/25 placeholder-white/70 text-white focus:ring-2 focus:ring-blue-400 focus:outline-none resize-y"
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full bg-[#003465] hover:bg-[#00274d] disabled:opacity-60 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending…" : "Send message"}
              </button>
            </form>
          </section>
        </div>
      </main>

      {/* Decorative leaves, matching the home page */}
      <img
        src={leaf}
        alt=""
        aria-hidden="true"
        className="hidden md:block absolute left-6 top-24 w-24 opacity-100 transform -rotate-45 pointer-events-none"
      />
      <img
        src={leaf}
        alt=""
        aria-hidden="true"
        className="hidden md:block absolute right-11 top-4 w-20 opacity-100 transform rotate-6 pointer-events-none"
      />
    </div>
  );
};

export default Contact;
