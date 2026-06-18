import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { cn } from '../utils';

export function OnboardingGuide(props: { onComplete: () => void; theme: 'modern' | 'wabi-sabi' }) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: '欢迎来到永久投资组合规划工具',
      description: '这是一个帮你管理和平衡资产配置的工具，灵感来自哈利·布朗的投资理念。',
      icon: '📊',
    },
    {
      title: '添加你的资产',
      description: '在"资产"标签页中，添加你拥有的所有资产，包括股票、债券、黄金和现金。支持多种货币。',
      icon: '💰',
    },
    {
      title: '设置目标配置',
      description: '在设置中指定每个资产类别的目标权重百分比。永久投资组合通常建议每类25%。',
      icon: '🎯',
    },
    {
      title: '查看再平衡建议',
      description: '工具会自动计算你的当前配置与目标的差异，并建议哪些资产需要调整。',
      icon: '⚖️',
    },
    {
      title: '记录历史快照',
      description: '定期保存你的资产配置快照，以便追踪投资组合的历史变化和成长。',
      icon: '📈',
    },
    {
      title: '开始使用',
      description: '你已经了解了基本功能。现在可以开始使用这个工具来管理你的投资组合了！',
      icon: '🚀',
    },
  ];

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={cn(
          'w-full max-w-md rounded-lg shadow-xl',
          props.theme === 'wabi-sabi'
            ? 'bg-[#fdfdfd] dark:bg-[#1a1a1b] border border-[#e5e5e5] dark:border-[#333]'
            : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700'
        )}
      >
        {/* Header */}
        <div className={cn(
          'px-6 py-4 border-b',
          props.theme === 'wabi-sabi'
            ? 'border-[#e5e5e5] dark:border-[#333]'
            : 'border-gray-200 dark:border-gray-700'
        )}>
          <h2 className={cn(
            'text-lg font-semibold',
            props.theme === 'wabi-sabi' && "font-['Noto_Serif_JP']"
          )}>操作引导</h2>
        </div>

        {/* Content */}
        <div className="px-6 py-8 min-h-64 flex flex-col items-center justify-center text-center">
          <div className="text-6xl mb-4">{step.icon}</div>
          <h3 className={cn(
            'text-xl font-semibold mb-3',
            props.theme === 'wabi-sabi' && "font-['Noto_Serif_JP']"
          )}>{step.title}</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 pb-6">
          {steps.map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                index === currentStep ? 'bg-blue-600 w-6' : 'bg-gray-300 dark:bg-gray-600'
              )}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className={cn(
              'flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              currentStep === 0
                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            上一步
          </button>

          {currentStep === steps.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('onboarding_completed', 'true');
                props.onComplete();
              }}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              完成
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              下一步
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
