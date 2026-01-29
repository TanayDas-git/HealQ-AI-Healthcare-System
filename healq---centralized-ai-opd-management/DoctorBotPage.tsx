import { useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react';
import {
  Heart,
  Globe,
  MessageCircle,
  Stethoscope,
  Shield,
  User,
  Send,
  RotateCcw,
} from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const CHAT_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/medical-chat`
  : '';

const placeholders = {
  en: 'Describe your symptoms...',
  hi: 'अपने लक्षण बताइए...',
  hinglish: 'Apne symptoms bataiye...',
};

const welcomeTexts = {
  en: {
    greeting: "Hello! I'm Dr. Aisha",
    subtitle: 'Your AI Medical Assistant',
    description:
      "I'm here to help you understand your symptoms and provide general health guidance. Please remember, I'm an AI assistant and cannot replace a real doctor.",
    features: [
      { icon: MessageCircle, text: 'Ask about your symptoms' },
      { icon: Stethoscope, text: 'Get general health guidance' },
      { icon: Shield, text: 'Know when to see a doctor' },
    ],
    prompt: 'How can I help you today?',
  },
  hi: {
    greeting: 'नमस्ते! मैं डॉ. आइशा हूं',
    subtitle: 'आपकी AI मेडिकल असिस्टेंट',
    description:
      'मैं यहाँ आपके लक्षणों को समझने और सामान्य स्वास्थ्य मार्गदर्शन प्रदान करने में मदद करने के लिए हूं। कृपया याद रखें, मैं एक AI सहायक हूं और एक वास्तविक डॉक्टर की जगह नहीं ले सकती।',
    features: [
      { icon: MessageCircle, text: 'अपने लक्षणों के बारे में पूछें' },
      { icon: Stethoscope, text: 'सामान्य स्वास्थ्य मार्गदर्शन प्राप्त करें' },
      { icon: Shield, text: 'जानें कब डॉक्टर से मिलना है' },
    ],
    prompt: 'आज मैं आपकी कैसे मदद कर सकती हूं?',
  },
  hinglish: {
    greeting: 'Namaste! Main Dr. Aisha hoon',
    subtitle: 'Aapki AI Medical Assistant',
    description:
      'Main yahaan aapke symptoms samajhne aur general health guidance dene ke liye hoon. Yaad rakhiye, main ek AI assistant hoon aur real doctor ki jagah nahi le sakti.',
    features: [
      { icon: MessageCircle, text: 'Apne symptoms ke baare mein puchiye' },
      { icon: Stethoscope, text: 'General health guidance paiye' },
      { icon: Shield, text: 'Jaaniye kab doctor se milna hai' },
    ],
    prompt: 'Aaj main aapki kaise madad kar sakti hoon?',
  },
};

type UseMedicalChatResult = {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (userMessage: string, language: string) => Promise<void>;
  clearChat: () => void;
  clearError: () => void;
};

const useMedicalChat = (): UseMedicalChatResult => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string, language: string) => {
      if (!CHAT_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
        setError(
          'Doctor Bot is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env.local.',
        );
        return;
      }

      const userMsg: Message = { role: 'user', content: userMessage };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setError(null);

      let assistantContent = '';

      try {
        const response = await fetch(CHAT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMsg],
            language,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error((errorData as { error?: string }).error || 'Failed to get response');
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const updateAssistant = (content: string) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
            }
            return [...prev, { role: 'assistant', content }];
          });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr) as {
                choices?: { delta?: { content?: string } }[];
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                updateAssistant(assistantContent);
              }
            } catch {
              buffer = line + '\n' + buffer;
              break;
            }
          }
        }
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Something went wrong. Please try again.';
        setError(message);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setIsLoading(false);
      }
    },
    [messages],
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearChat,
    clearError,
  };
};

type ChatHeaderProps = {
  language: string;
  onLanguageChange: (lang: string) => void;
};

const ChatHeader = ({ language, onLanguageChange }: ChatHeaderProps) => {
  return (
    <header className="bg-card/80 backdrop-blur-lg border-b border-border/50 px-4 py-3 sticky top-0 z-10">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DoctorAvatar size="md" />
          <div>
            <h1 className="font-semibold text-foreground text-sm md:text-base">Dr. Aisha</h1>
            <p className="text-xs text-muted-foreground">AI Medical Assistant</p>
          </div>
        </div>
        <LanguageSelector value={language} onChange={onLanguageChange} />
      </div>
    </header>
  );
};

type DoctorAvatarProps = {
  size?: 'sm' | 'md' | 'lg';
};

const DoctorAvatar = ({ size = 'md' }: DoctorAvatarProps) => {
  const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const iconSizes: Record<'sm' | 'md' | 'lg', number> = {
    sm: 14,
    md: 16,
    lg: 22,
  };

  return (
    <div
      className={`${sizeClasses[size]} rounded-full gradient-doctor flex items-center justify-center shadow-glow flex-shrink-0`}
    >
      <Heart className="text-primary-foreground" size={iconSizes[size]} fill="currentColor" />
    </div>
  );
};

type LanguageSelectorProps = {
  value: string;
  onChange: (value: string) => void;
};

const languages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'हिंदी', flag: '🇮🇳' },
  { code: 'hinglish', label: 'Hinglish', flag: '🇮🇳' },
];

const LanguageSelector = ({ value, onChange }: LanguageSelectorProps) => {
  return (
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};

type ChatMessageProps = {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
};

const ChatMessage = ({ role, content, isStreaming }: ChatMessageProps) => {
  const isDoctor = role === 'assistant';

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isDoctor ? 'justify-start' : 'justify-end'}`}
    >
      {isDoctor && <DoctorAvatar size="sm" />}

      <div
        className={`max-w-[80%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
          isDoctor
            ? 'bg-card shadow-soft border border-border/50'
            : 'gradient-doctor text-primary-foreground shadow-glow'
        }`}
      >
        <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-current ml-0.5 animate-pulse-gentle" />
          )}
        </p>
      </div>

      {!isDoctor && (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
          <User className="text-secondary-foreground" size={14} />
        </div>
      )}
    </div>
  );
};

type ChatInputProps = {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

const ChatInput = ({ onSend, disabled, placeholder }: ChatInputProps) => {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-3 items-end">
      <div className="flex-1 relative">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Apni symptoms bataiye...'}
          disabled={disabled}
          rows={1}
          className="w-full bg-card border border-border rounded-2xl px-4 py-3 pr-4 text-sm md:text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none min-h-[48px] max-h-[120px] shadow-soft transition-all"
          style={{ height: '48px' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = '48px';
            target.style.height = Math.min(target.scrollHeight, 120) + 'px';
          }}
        />
      </div>
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="w-12 h-12 rounded-full gradient-doctor flex items-center justify-center shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100"
        aria-label="Send message"
      >
        <Send className="w-5 h-5 text-primary-foreground" />
      </button>
    </div>
  );
};

type TypingIndicatorProps = {
  visible: boolean;
};

const TypingIndicator = ({ visible }: TypingIndicatorProps) => {
  if (!visible) return null;

  return (
    <div className="flex gap-3 items-end animate-fade-in">
      <DoctorAvatar size="sm" />
      <div className="bg-card shadow-soft border border-border/50 rounded-2xl px-4 py-3">
        <div className="flex gap-1.5 items-center h-5">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    </div>
  );
};

type WelcomeMessageProps = {
  language: string;
};

const WelcomeMessage = ({ language }: WelcomeMessageProps) => {
  const texts = (welcomeTexts as Record<string, (typeof welcomeTexts)['en']>)[language] ||
    welcomeTexts.en;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 animate-fade-in">
      <DoctorAvatar size="lg" />

      <h2 className="mt-4 text-xl md:text-2xl font-semibold text-foreground text-center">
        {texts.greeting}
      </h2>
      <p className="text-sm text-primary font-medium">{texts.subtitle}</p>

      <p className="mt-4 text-sm text-muted-foreground text-center max-w-md leading-relaxed">
        {texts.description}
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {texts.features.map((feature, index) => (
          <div key={index} className="flex items-center gap-2 text-sm text-foreground/80">
            <feature.icon className="w-4 h-4 text-primary" />
            <span>{feature.text}</span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-base font-medium text-foreground">{texts.prompt}</p>
    </div>
  );
};

const DoctorBotPage = () => {
  const [language, setLanguage] = useState('en');
  const { messages, isLoading, error, sendMessage, clearChat, clearError } = useMedicalChat();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = (message: string) => {
    sendMessage(message, language);
  };

  return (
    <div className="min-h-screen gradient-hero flex flex-col">
      <ChatHeader language={language} onLanguageChange={setLanguage} />

      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <WelcomeMessage language={language} />
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg, index) => (
                <ChatMessage
                  key={index}
                  role={msg.role}
                  content={msg.content}
                  isStreaming={
                    isLoading && msg.role === 'assistant' && index === messages.length - 1
                  }
                />
              ))}
              <TypingIndicator
                visible={isLoading && messages[messages.length - 1]?.role === 'user'}
              />
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      <footer className="bg-card/80 backdrop-blur-lg border-t border-border/50 px-4 py-4 sticky bottom-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            {messages.length > 0 && (
              <button
                onClick={() => {
                  clearChat();
                  clearError();
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>New conversation</span>
              </button>
            )}
          </div>
          {error && (
            <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <ChatInput
            onSend={handleSend}
            disabled={isLoading}
            placeholder={placeholders[language as keyof typeof placeholders]}
          />
          <p className="text-xs text-muted-foreground text-center mt-3">
            AI medical assistant for guidance only. Always consult a real doctor.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default DoctorBotPage;

