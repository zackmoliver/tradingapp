// src/components/FeatureImportanceCard.tsx
// Bar list of top features

import React from 'react';
import { TrendingUp, Brain, BarChart3, Globe } from 'lucide-react';
import { FeatureImportance } from '@/features/explain/importance';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';

interface FeatureImportanceCardProps {
  features: FeatureImportance[];
  className?: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'technical':
      return <TrendingUp className="w-4 h-4" />;
    case 'sentiment':
      return <Brain className="w-4 h-4" />;
    case 'fundamental':
      return <BarChart3 className="w-4 h-4" />;
    case 'macro':
      return <Globe className="w-4 h-4" />;
    default:
      return <BarChart3 className="w-4 h-4" />;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'technical':
      return 'text-blue-600 bg-blue-50';
    case 'sentiment':
      return 'text-purple-600 bg-purple-50';
    case 'fundamental':
      return 'text-green-600 bg-green-50';
    case 'macro':
      return 'text-orange-600 bg-orange-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
};

const formatImportance = (importance: number): string => {
  return (importance * 100).toFixed(1);
};

export const FeatureImportanceCard: React.FC<FeatureImportanceCardProps> = ({
  features,
  className = '',
}) => {
  if (features.length === 0) {
    return (
      <Card className={className}>
        <CardHeader 
          title="Feature Importance" 
          subtitle="Top factors driving model predictions"
        />
        <CardBody>
          <div className="text-center py-8">
            <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No feature importance data available</p>
            <p className="text-sm text-gray-500 mt-1">Run a backtest to see feature analysis</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const maxImportance = Math.max(...features.map(f => f.importance));

  return (
    <Card className={className}>
      <CardHeader 
        title="Feature Importance" 
        subtitle={`Top ${features.length} factors driving model predictions`}
      />
      <CardBody>
        <div className="space-y-3">
          {features.map((feature, index) => {
            const barWidth = (feature.importance / maxImportance) * 100;
            const categoryColor = getCategoryColor(feature.category);
            
            return (
              <div key={feature.name} className="group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 min-w-[20px]">
                      #{index + 1}
                    </span>
                    <div className={`p-1 rounded ${categoryColor}`}>
                      {getCategoryIcon(feature.category)}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {feature.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {formatImportance(feature.importance)}%
                  </span>
                </div>
                
                {/* Progress bar */}
                <div className="relative">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
                
                {/* Description tooltip on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1">
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded border">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Category summary */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Feature Categories</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(
              features.reduce((acc, feature) => {
                acc[feature.category] = (acc[feature.category] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([category, count]) => (
              <div key={category} className="flex items-center gap-2">
                <div className={`p-1 rounded ${getCategoryColor(category)}`}>
                  {getCategoryIcon(category)}
                </div>
                <span className="text-sm text-gray-600 capitalize">
                  {category} ({count})
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Model performance indicator */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Model Insights</span>
          </div>
          <p className="text-xs text-blue-700">
            Top feature: <strong>{features[0].name}</strong> contributes{' '}
            <strong>{formatImportance(features[0].importance)}%</strong> to prediction accuracy.
            {features.length > 1 && (
              <span>
                {' '}Combined top 3 features account for{' '}
                <strong>
                  {formatImportance(
                    features.slice(0, 3).reduce((sum, f) => sum + f.importance, 0)
                  )}%
                </strong>{' '}
                of model decisions.
              </span>
            )}
          </p>
        </div>
      </CardBody>
    </Card>
  );
};
