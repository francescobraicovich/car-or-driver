// Research-only joint blend of complete driver and constructor ratings.
export function jointRatingBlend(timeline, baseline, challenger, driverShare, carShare) {
  const pre = [];
  const post = [];
  const z = [];
  for (const [i, weekend] of timeline.entries()) {
    const driverWeight = Array.isArray(driverShare) ? driverShare[i] : driverShare;
    const carWeight = Array.isArray(carShare) ? carShare[i] : carShare;
    const old = baseline.pre[i];
    const other = challenger.pre[i];
    const driverDelta = (id) => driverWeight * ((other.rated.get(id) ?? old.rated.get(id)) - old.rated.get(id));
    const carDelta = (id) => carWeight * ((other.cars.get(id) ?? old.cars.get(id)) - old.cars.get(id));
    pre.push({ ...old,
      rated: new Map([...old.rated].map(([id, value]) => [id, value + driverDelta(id)])),
      drivers: new Map([...old.drivers].map(([id, value]) => [id, value + driverDelta(id)])),
      cars: new Map([...old.cars].map(([id, value]) => [id, value + carDelta(id)])),
    });
    const original = baseline.z[i];
    const plain = new Float64Array(original.plain.length);
    const adj = new Float64Array(original.adj.length);
    for (const [j, ob] of weekend.obs[baseline.session].entries()) {
      const change = baseline.k * (driverDelta(ob.x) - driverDelta(ob.y) + carDelta(ob.cx) - carDelta(ob.cy));
      const attenuation = original.vari ? Math.sqrt(1 + (Math.PI / 8) * baseline.k ** 2 * original.vari[j]) : 1;
      plain[j] = original.plain[j] + change;
      adj[j] = original.adj[j] + change / attenuation;
    }
    z.push({ ...original, plain, adj });
    const oldPost = baseline.post[i];
    const otherPost = challenger.post[i];
    post.push({ ...oldPost,
      drivers: new Map([...oldPost.drivers].map(([id, value]) => [id, { ...value,
        m: value.m + driverWeight * ((otherPost.drivers.get(id)?.m ?? value.m) - value.m),
      }])),
      cars: new Map([...oldPost.cars].map(([id, value]) => [id, { ...value,
        m: value.m + carWeight * ((otherPost.cars.get(id)?.m ?? value.m) - value.m),
      }])),
    });
  }
  return { ...baseline, name: 'joint-driver-car-blend', pre, post, z };
}
