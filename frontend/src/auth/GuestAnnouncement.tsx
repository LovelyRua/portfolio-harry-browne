import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils';
import { TrendingUp, Shield, Zap } from 'lucide-react';

export function GuestAnnouncement(props: {
  onQuickStart: () => void;
  onLogin: () => void;
  theme: 'modern' | 'wabi-sabi';
}) {
  const { t } = useTranslation();

  return (
    <div className={cn(
      "mb-6 p-6 rounded-lg border-2 border-dashed",
      props.theme === 'wabi-sabi'
        ? "bg-[#fdfdfd]/50 dark:bg-[#1a1a1b]/50 border-[#d3381c] text-[#1a1a1b] dark:text-white"
        : "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100"
    )}>
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className={cn(
            "p-3 rounded-full",
            props.theme === 'wabi-sabi'
              ? "bg-[#d3381c] text-white"
              : "bg-blue-600 text-white"
          )}>
            <TrendingUp className="w-8 h-8" />
          </div>
        </div>

        <div>
          <h3 className={cn(
            "text-xl font-semibold mb-2",
            props.theme === 'wabi-sabi' && "font-['Noto_Serif_JP']"
          )}>
            {t('guest_title')}
          </h3>
          <p className="text-sm opacity-80 max-w-2xl mx-auto">
            {t('guest_subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="flex flex-col items-center space-y-2">
            <Shield className="w-6 h-6 text-green-600" />
            <span className="text-sm font-medium">{t('guest_feature_local')}</span>
            <span className="text-xs opacity-70">{t('guest_feature_local_desc')}</span>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <Zap className="w-6 h-6 text-yellow-600" />
            <span className="text-sm font-medium">{t('guest_feature_realtime')}</span>
            <span className="text-xs opacity-70">{t('guest_feature_realtime_desc')}</span>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <span className="text-sm font-medium">{t('guest_feature_history')}</span>
            <span className="text-xs opacity-70">{t('guest_feature_history_desc')}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-6">
          <button
            type="button"
            onClick={props.onQuickStart}
            className={cn(
              "px-6 py-3 font-medium rounded-lg transition-colors",
              props.theme === 'wabi-sabi'
                ? "bg-[#d3381c] text-white hover:bg-[#a32a15]"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            🚀 {t('guest_quick_start')}
          </button>
          <button
            type="button"
            onClick={props.onLogin}
            className={cn(
              "px-6 py-3 font-medium rounded-lg transition-colors",
              props.theme === 'wabi-sabi'
                ? "border border-[#1a1a1b] text-[#1a1a1b] hover:bg-[#1a1a1b] hover:text-white dark:border-white dark:text-white dark:hover:bg-white dark:hover:text-[#1a1a1b]"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            )}
          >
            🔐 {t('guest_login')}
          </button>
        </div>

        <p className="text-xs opacity-60 mt-4">
          {t('guest_tip')}
        </p>
      </div>
    </div>
  );
}
