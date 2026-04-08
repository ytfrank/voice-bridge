# Ground Truth - voice-bridge 测试音频预期文本

## 短音频 (Short)

### en_short_3s_weather.wav (1.4s)
**原文**: "The weather is nice today."

### en_short_5s_ai.wav (5.3s)
**原文**: "I believe that artificial intelligence will fundamentally change how we work and live in the next decade."

### en_short_8s_pangram.wav (7.5s)
**原文**: "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet and is commonly used for testing."

### short_sentence.wav (1.4s)
**原文**: "Hello how are you today?"

### medium_sentence.wav (0.9s)
**原文**: "A quick brown." (短句)

## 中等音频 (Medium)

### en_medium_30s_climate.wav (26.3s)
**原文**: "Climate change is one of the most pressing issues facing our world today. Scientists have been studying the effects of greenhouse gas emissions on global temperatures for decades. The evidence is clear that human activities are contributing to rising sea levels, more frequent extreme weather events, and loss of biodiversity. It is crucial that we take action now to reduce our carbon footprint and transition to renewable energy sources before the damage becomes irreversible."

### en_medium_3min_ai.wav (75.6s)
**原文**: "In recent years, the field of artificial intelligence has made remarkable strides. Machine learning algorithms can now process vast amounts of data and identify patterns that would be impossible for humans to detect. Natural language processing has advanced to the point where AI systems can engage in meaningful conversations, translate languages with high accuracy, and even generate creative content. Computer vision technology enables machines to recognize objects, faces, and scenes with superhuman precision. Autonomous vehicles are being tested on roads around the world, promising to revolutionize transportation. In healthcare, AI is helping doctors diagnose diseases earlier and develop more effective treatment plans. The potential applications seem limitless, from improving agricultural yields to optimizing energy consumption in smart cities. However, these advances also raise important ethical questions about privacy, job displacement, and the concentration of power in the hands of a few large technology companies. It is essential that society engages in thoughtful dialogue about how to harness these powerful tools for the benefit of all humanity, while minimizing potential risks and ensuring equitable access to the benefits of technological progress."

### musk_21s_correct.wav (21.4s)
**原文**: "and for most of actually human history that China has been the most powerful nation on earth and so you can expect that they will do many great things Steve Seek being one of them that is simply a result of the immense amount of talent"

### long_sentence.wav (11.4s)
**原文**: (待确认 - 需要听译)

## 长音频 (Long)

### en_long_5min_ai.wav (302s)
**原文**: (3min_ai循环3次，同上述3min原文重复)

### en_long_12min_ai.wav (756s)
**原文**: (3min_ai循环9次，同上述3min原文重复)

## 边界测试

### silent_5s.wav
**预期**: 无语音内容，应返回空或跳过

### noise_10s.wav
**预期**: 纯白噪音，无有效语音
