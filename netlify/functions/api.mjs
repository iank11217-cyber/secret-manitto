
import { getStore } from '@netlify/blobs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

const hash = s => createHash('sha256').update(s).digest('hex');
const id = () => randomBytes(16).toString('hex');
const clean = s => String(s || '').trim();

const eq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

const store = () =>
  getStore({ name: 'manitto-v1', consistency: 'strong' });

async function entries(s, prefix) {
  let cursor;
  const keys = [];
  do {
    const result = await s.list({ prefix, cursor });
    keys.push(...result.blobs.map(b => b.key));
    cursor = result.cursor;
  } while (cursor);
  return keys;
}

const adminPassword = () =>
  process.env.MANITTO_ADMIN_PASSWORD || '';

const isAdmin = (name, password) =>
  name === '이안' &&
  !!adminPassword() &&
  eq(hash(password), hash(adminPassword()));

export default async (req) => {
  if (req.method !== 'POST')
    return json({ error: 'POST만 지원합니다.' }, 405);

  let b;
  try {
    b = await req.json();
  } catch {
    return json({ error: '잘못된 요청입니다.' }, 400);
  }

  const action = clean(b.action);
  const code = clean(b.code).toUpperCase();
  const name = clean(b.name);
  const token = clean(b.token);
  const s = store();

  try {
    if (action === 'create') {
      if (!name || name.length > 24)
        return json({ error: '이름은 1~24자로 입력해 줘.' }, 400);

      if (name === '이안' && !isAdmin(name, clean(b.adminPassword)))
        return json({ error: '이안 관리자 비밀번호를 입력해 줘.' }, 403);

      let c;
      do {
        c = randomBytes(5).toString('hex').toUpperCase();
      } while (await s.get('room/' + c));

      await s.setJSON('room/' + c, { created: Date.now() });

      const t = id(), uid = id();
      await s.setJSON(`member/${c}/${uid}`, {
        uid, name, auth: hash(t), created: Date.now()
      });

      return json({ code: c, token: t, uid, name });
    }

    if (!/^[A-F0-9]{10}$/.test(code) || !await s.get('room/' + code))
      return json({ error: '방 코드를 확인해 줘.' }, 404);

    if (action === 'join') {
      if (!name || name.length > 24)
        return json({ error: '이름은 1~24자로 입력해 줘.' }, 400);

      if (name === '이안' && !isAdmin(name, clean(b.adminPassword)))
        return json({ error: '이안 관리자 비밀번호를 입력해 줘.' }, 403);

      const keys = await entries(s, `member/${code}/`);
      if (keys.length >= 30)
        return json({ error: '한 방에는 최대 30명까지 입장할 수 있어.' }, 400);

      const people = (await Promise.all(
        keys.map(k => s.get(k, { type: 'json' }))
      )).filter(Boolean);

      if (people.some(p =>
        p.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      ))
        return json({ error: '이미 사용 중인 이름이야.' }, 409);

      const t = id(), uid = id();
      await s.setJSON(`member/${code}/${uid}`, {
        uid, name, auth: hash(t), created: Date.now()
      });

      return json({ code, token: t, uid, name });
    }

    if (action === 'adminState') {
      if (!isAdmin('이안', clean(b.adminPassword)))
        return json({ error: '관리자 비밀번호가 올바르지 않아.' }, 403);

      const keys = await entries(s, `member/${code}/`);
      const members = (await Promise.all(
        keys.map(k => s.get(k, { type: 'json' }))
      )).filter(Boolean).map(p => ({
        uid: p.uid,
        name: p.name
      }));

      return json({ members });
    }

    if (action === 'adminDelete') {
      if (!isAdmin('이안', clean(b.adminPassword)))
        return json({ error: '관리자 비밀번호가 올바르지 않아.' }, 403);

      const target = clean(b.target);

      if (!/^[a-f0-9]{32}$/.test(target))
        return json({ error: '삭제할 참가자를 선택해 줘.' }, 400);

      const person = await s.get(
        `member/${code}/${target}`, { type: 'json' }
      );

      if (!person)
        return json({ error: '이미 삭제된 참가자야.' }, 404);

      await s.delete(`member/${code}/${target}`);
      return json({ ok: true });
    }

    const uid = clean(b.uid);

    if (!/^[a-f0-9]{32}$/.test(uid) ||
        !/^[a-f0-9]{32}$/.test(token))
      return json({ error: '다시 입장해 줘.' }, 401);

    const me = await s.get(
      `member/${code}/${uid}`, { type: 'json' }
    );

    if (!me || !eq(me.auth, hash(token)))
      return json({ error: '참가자 인증에 실패했어.' }, 401);

    if (action === 'state') {
      const keys = await entries(s, `member/${code}/`);

      const members = (await Promise.all(
        keys.map(k => s.get(k, { type: 'json' }))
      )).filter(Boolean).map(p => ({
        uid: p.uid,
        name: p.name
      }));

      const msgKeys = await entries(s, `msg/${code}/${uid}/`);

      const messages = (await Promise.all(
        msgKeys.slice(-100).map(k => s.get(k, { type: 'json' }))
      )).filter(Boolean)
        .sort((a, b) => a.time - b.time)
        .map(({ body, time }) => ({ body, time }));

      return json({ members, messages });
    }

    if (action === 'send') {
      const to = clean(b.to);
      const body = clean(b.body);

      if (!/^[a-f0-9]{32}$/.test(to) || to === uid)
        return json({ error: '받을 친구를 선택해 줘.' }, 400);

      if (!body || body.length > 500)
        return json({ error: '메시지는 1~500자로 입력해 줘.' }, 400);

      if (!await s.get(`member/${code}/${to}`))
        return json({ error: '친구를 찾을 수 없어.' }, 404);

      const time = Date.now();

      await s.setJSON(
        `msg/${code}/${to}/${String(time).padStart(15, '0')}-${id()}`,
        { body, time }
      );

      return json({ ok: true });
    }

    return json({ error: '알 수 없는 요청입니다.' }, 400);

  } catch (e) {
    console.error(e);
    return json({
      error: '서버에 문제가 생겼어. 잠시 후 다시 시도해 줘.'
    }, 500);
  }
};
