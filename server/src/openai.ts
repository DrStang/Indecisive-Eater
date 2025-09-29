import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


export async function summarizePlace(name: string, raw?: string) {
    const base = raw && raw.length <= 220 ? raw : undefined;
    if (base) return base;
    const prompt = `Write a friendly 1-sentence, 20-30 word blurb for the restaurant "${name}". Keep it neutral and avoid hype.`;
    const res = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 60
    });
    return res.choices[0]?.message?.content?.trim() || '';
}